import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type SessionIndexRecord = {
  id?: unknown;
  thread_name?: unknown;
};

export type FileSignature = {
  size: number;
  mtimeMs: number;
};

export function sessionIndexPaths(sessionRoots: string[]): string[] {
  const candidates = new Set<string>([path.join(os.homedir(), ".codex", "session_index.jsonl")]);
  for (const root of sessionRoots) candidates.add(path.join(path.dirname(path.resolve(root)), "session_index.jsonl"));
  return [...candidates].sort();
}

export function sessionIndexSignatures(paths: string[]): Map<string, FileSignature> {
  const signatures = new Map<string, FileSignature>();
  for (const file of paths) {
    try {
      const stat = fs.statSync(file);
      if (stat.isFile()) signatures.set(file, { size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      // Missing or temporarily unavailable indexes are treated as empty.
    }
  }
  return signatures;
}

export function parseSessionIndex(contents: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const line of contents.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const record = JSON.parse(line) as SessionIndexRecord;
      if (typeof record.id !== "string" || typeof record.thread_name !== "string") continue;
      const id = record.id.trim().toLowerCase();
      const name = record.thread_name.trim();
      if (id && name) names.set(id, name);
    } catch {
      // A malformed line must not prevent the remaining local titles from loading.
    }
  }
  return names;
}

export function readSessionIndexes(paths: string[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const file of paths) {
    try {
      for (const [id, name] of parseSessionIndex(fs.readFileSync(file, "utf8"))) names.set(id, name);
    } catch {
      // Missing, locked, or malformed index files fall back to rollout-derived titles.
    }
  }
  return names;
}

export function signaturesEqual(left: ReadonlyMap<string, FileSignature>, right: ReadonlyMap<string, FileSignature>): boolean {
  if (left.size !== right.size) return false;
  for (const [file, signature] of left) {
    const candidate = right.get(file);
    if (!candidate || candidate.size !== signature.size || candidate.mtimeMs !== signature.mtimeMs) return false;
  }
  return true;
}
