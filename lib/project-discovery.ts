import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import type { ProjectIdentity, RolloutReport } from "@/lib/types";

type GitProject = { topLevel: string; commonDir: string };

const projectCache = new Map<string, Omit<ProjectIdentity, "sessionCount" | "turnCount" | "lastActivityAt" | "defaultSelected">>();

export function defaultSessionRoots(): string[] {
  const codexRoot = path.join(os.homedir(), ".codex");
  return [path.join(codexRoot, "sessions"), path.join(codexRoot, "archived_sessions")].filter((root) => fs.existsSync(root));
}

export function sessionRootsFromEnvironment(): string[] {
  const configured = process.env.CODEX_SESSIONS_ROOTS?.split(/[;,]/).map((value) => value.trim()).filter(Boolean);
  return (configured?.length ? configured : defaultSessionRoots()).map((root) => path.resolve(root));
}

export function defaultProjectRoot(): string {
  return path.resolve(process.env.CODEX_PROJECT_ROOT || process.cwd());
}

export function projectAllowlistFromEnvironment(): string[] {
  return (process.env.CODEX_PROJECT_ALLOWLIST?.split(";").map((value) => value.trim()).filter(Boolean) ?? []).map((value) => path.resolve(value));
}

function normalize(value: string): string {
  return path.resolve(value).replace(/[\\/]$/, "").toLowerCase();
}

export function isWithin(candidate: string, root: string): boolean {
  const child = normalize(candidate);
  const parent = normalize(root);
  return child === parent || child.startsWith(`${parent}${path.sep}`);
}

function gitProject(directory: string): GitProject | null {
  try {
    const topLevel = execFileSync("git", ["-C", directory, "rev-parse", "--path-format=absolute", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const commonDir = execFileSync("git", ["-C", directory, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return topLevel && commonDir ? { topLevel: path.resolve(topLevel), commonDir: path.resolve(directory, commonDir) } : null;
  } catch {
    return null;
  }
}

function stableId(value: string): string {
  return createHash("sha1").update(normalize(value)).digest("hex").slice(0, 14);
}

export function resolveProjectIdentity(cwd: string | null, fallbackRoot = defaultProjectRoot()) {
  const requested = cwd ? (path.isAbsolute(cwd) ? path.resolve(cwd) : path.resolve(fallbackRoot, cwd)) : fallbackRoot;
  const key = normalize(requested);
  const cached = projectCache.get(key);
  if (cached) return cached;
  const git = gitProject(requested);
  const canonicalRoot = git ? path.dirname(git.commonDir) : requested;
  const identity = {
    id: `${git ? "git" : "path"}-${stableId(git?.commonDir ?? canonicalRoot)}`,
    label: path.basename(canonicalRoot) || canonicalRoot,
    rootPath: canonicalRoot,
    gitCommonDir: git?.commonDir ?? null,
    worktrees: [git?.topLevel ?? requested],
    isGitRepository: Boolean(git),
  };
  projectCache.set(key, identity);
  return identity;
}

function walk(root: string, output: string[]): void {
  if (!fs.existsSync(root)) return;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) walk(fullPath, output);
    else if (entry.isFile() && entry.name.endsWith(".jsonl")) output.push(fullPath);
  }
}

export function discoverRollouts(roots = sessionRootsFromEnvironment()): string[] {
  const output: string[] = [];
  for (const root of roots) walk(path.resolve(root), output);
  return [...new Set(output)].sort();
}

export function discoverProjectAssignments(reports: Iterable<RolloutReport>, fallbackRoot = defaultProjectRoot()): {
  projects: ProjectIdentity[];
  projectIdByThread: Map<string, string>;
} {
  const reportList = [...reports];
  const allowlist = projectAllowlistFromEnvironment();
  const allowedProjects = allowlist.map((entry) => resolveProjectIdentity(entry, fallbackRoot));
  const identities = new Map<string, ReturnType<typeof resolveProjectIdentity>>();
  const projectIdByThread = new Map<string, string>();
  const defaultIdentity = resolveProjectIdentity(fallbackRoot, fallbackRoot);
  for (const report of reportList) {
    const identity = resolveProjectIdentity(report.metadata.sessionMeta.cwd, fallbackRoot);
    const allowed = !allowedProjects.length || allowedProjects.some((candidate) => candidate.id === identity.id || isWithin(identity.rootPath, candidate.rootPath));
    if (!allowed) continue;
    identities.set(identity.id, identity);
    projectIdByThread.set(report.metadata.threadId.toLowerCase(), identity.id);
  }
  for (let pass = 0; pass < reportList.length; pass += 1) {
    let changed = false;
    for (const report of reportList) {
      const parent = (report.metadata.sessionMeta.parentThreadId || report.metadata.sessionMeta.forkedFromId)?.toLowerCase();
      if (!parent) continue;
      const inheritedProject = projectIdByThread.get(parent);
      const threadId = report.metadata.threadId.toLowerCase();
      if (inheritedProject && projectIdByThread.get(threadId) !== inheritedProject) {
        projectIdByThread.set(threadId, inheritedProject);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const byId = new Map<string, ProjectIdentity>();
  for (const report of reportList) {
    const projectId = projectIdByThread.get(report.metadata.threadId.toLowerCase());
    if (!projectId) continue;
    const identity = identities.get(projectId) ?? resolveProjectIdentity(report.metadata.sessionMeta.cwd, fallbackRoot);
    identities.set(projectId, identity);
    const existing = byId.get(projectId) ?? {
      ...identity,
      worktrees: [],
      sessionCount: 0,
      turnCount: 0,
      lastActivityAt: null,
      defaultSelected: projectId === defaultIdentity.id,
    };
    existing.worktrees = [...new Set([...existing.worktrees, ...identity.worktrees])].sort();
    existing.sessionCount += 1;
    existing.turnCount += report.turns.length;
    const activity = report.metadata.rangeLastActivityAt;
    if (activity && (!existing.lastActivityAt || activity > existing.lastActivityAt)) existing.lastActivityAt = activity;
    byId.set(projectId, existing);
  }
  return {
    projects: [...byId.values()].sort((left, right) => Number(right.defaultSelected) - Number(left.defaultSelected) || (right.lastActivityAt ?? "").localeCompare(left.lastActivityAt ?? "") || left.label.localeCompare(right.label)),
    projectIdByThread,
  };
}
