import "server-only";

import fs from "node:fs";

import {
  defaultProjectRoot,
  discoverProjectAssignments,
  discoverRollouts,
  sessionRootsFromEnvironment,
} from "@/lib/project-discovery";
import { buildScopedProjectReport, type ReportQuery } from "@/lib/report-aggregation";
import { readSessionIndexes, sessionIndexPaths, sessionIndexSignatures, signaturesEqual, type FileSignature } from "@/lib/session-index";
import type { LiveSnapshot, RolloutReport } from "@/lib/types";

const POLL_INTERVAL_MS = 3000;

class LiveProjectStore {
  private readonly fallbackRoot = defaultProjectRoot();
  private readonly roots = sessionRootsFromEnvironment();
  private readonly indexPaths = sessionIndexPaths(this.roots);
  private signatures = new Map<string, FileSignature>();
  private indexSignatures = new Map<string, FileSignature>();
  private threadNames = new Map<string, string>();
  private reports = new Map<string, RolloutReport>();
  private parseErrors: Record<string, string> = {};
  private lastPollAt = 0;
  private inFlight: Promise<boolean> | null = null;

  async snapshot(query: ReportQuery = {}): Promise<LiveSnapshot> {
    const changed = await this.refresh();
    const assignments = discoverProjectAssignments(this.reports.values(), this.fallbackRoot);
    const report = buildScopedProjectReport({
      reports: this.reports.values(),
      projects: assignments.projects,
      projectIdByThread: assignments.projectIdByThread,
      threadNames: this.threadNames,
      sourceRoots: this.roots,
      parseErrors: this.parseErrors,
      candidateRolloutCount: this.signatures.size,
      pollIntervalMs: POLL_INTERVAL_MS,
      query,
    });
    return {
      report,
      server: {
        defaultProjectRoot: this.fallbackRoot,
        sessionRoots: this.roots,
        pollIntervalMs: POLL_INTERVAL_MS,
        polledAt: new Date(this.lastPollAt || Date.now()).toISOString(),
        changed,
      },
    };
  }

  private async refresh(): Promise<boolean> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.poll().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async poll(): Promise<boolean> {
    const now = Date.now();
    if (this.lastPollAt && now - this.lastPollAt < 500) return false;
    const files = discoverRollouts(this.roots);
    const nextSignatures = new Map<string, FileSignature>();
    let changed = false;
    const nextIndexSignatures = sessionIndexSignatures(this.indexPaths);
    if (!signaturesEqual(this.indexSignatures, nextIndexSignatures)) {
      this.threadNames = readSessionIndexes([...nextIndexSignatures.keys()]);
      this.indexSignatures = nextIndexSignatures;
      changed = true;
    }
    for (const file of files) {
      try {
        const stat = fs.statSync(file);
        const signature = { size: stat.size, mtimeMs: stat.mtimeMs };
        nextSignatures.set(file, signature);
        const previous = this.signatures.get(file);
        if (!previous || previous.size !== signature.size || previous.mtimeMs !== signature.mtimeMs) {
          changed = true;
          try {
            const { parseRollout } = await import("@/lib/rollout-parser");
            this.reports.set(file, parseRollout(file, { tolerateLive: true }));
            delete this.parseErrors[file];
          } catch (error) {
            this.parseErrors[file] = error instanceof Error ? error.message : "无法解析 rollout";
          }
        }
      } catch {
        changed = true;
      }
    }
    for (const file of this.signatures.keys()) {
      if (!nextSignatures.has(file)) {
        changed = true;
        this.reports.delete(file);
        delete this.parseErrors[file];
      }
    }
    this.signatures = nextSignatures;
    this.lastPollAt = now;
    return changed;
  }
}

const globalStore = globalThis as typeof globalThis & { __codexTokenDeskStore?: LiveProjectStore };
export const liveStore = globalStore.__codexTokenDeskStore ?? new LiveProjectStore();
globalStore.__codexTokenDeskStore = liveStore;
