import { describe, expect, it } from "vitest";

import { aggregateModelUsage, buildScopedProjectReport } from "@/lib/report-aggregation";
import type { ProjectIdentity, RolloutReport, TurnReport, Usage } from "@/lib/types";

const usage = (total: number): Usage => ({ input: total, cached: 0, cache_write: 0, output: 0, reasoning: 0, total });

function dayAtOffset(offset: number): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function turn(id: string, day: string, total: number, model = "gpt-5.6-sol"): TurnReport {
  return {
    index: 1,
    turnId: id,
    status: "complete",
    startedAt: `${day}T01:00:00Z`,
    endedAt: `${day}T01:01:00Z`,
    durationMs: 60_000,
    timeToFirstTokenMs: 100,
    abortReason: null,
    messages: [{ timestamp: `${day}T01:00:00Z`, text: id, clientId: null, imageCount: 0, audioCount: 0 }],
    outputs: [],
    models: [model],
    efforts: ["medium"],
    contextWindows: [1000],
    tokenSnapshots: 1,
    modelResponses: 1,
    compactions: 0,
    warnings: [],
    usage: usage(total),
    dailyUsage: [{ date: day, usage: usage(total) }],
    dailyModelResponses: { [day]: 1 },
    dailyTokenSnapshots: { [day]: 1 },
    breakdown: { cachedInput: 0, cacheWriteInput: 0, otherNonCachedInput: total, ordinaryOutput: 0, reasoningOutput: 0, unclassified: 0 },
    breakdownMismatch: 0,
    rangeClipped: false,
    rangeFirstActivityAt: `${day}T01:00:00Z`,
    rangeLastActivityAt: `${day}T01:01:00Z`,
    contextSnapshot: { snapshotType: "turn_end", tokens: 100, windowTokens: 1000, occupancyRate: 10, timestamp: `${day}T01:01:00Z` },
    contextTimeline: [],
    contextCompactions: [],
    toolCalls: [],
    toolSummary: { callCount: 0, reportedCallCount: 0, unknownCallCount: 0, usage: usage(0), categories: {} },
  };
}

function report(id: string, projectPath: string, item: TurnReport, parentThreadId: string | null = null): RolloutReport {
  return {
    schemaVersion: 1,
    generator: { name: "test", version: "1" },
    metadata: {
      threadId: id,
      sourcePath: `${projectPath}/${id}.jsonl`,
      sourceName: `${id}.jsonl`,
      sourceBytes: 1,
      sourceModifiedAt: item.endedAt ?? item.startedAt,
      generatedAt: item.endedAt ?? item.startedAt,
      sessionMeta: { id, sessionId: null, cwd: projectPath, originator: null, cliVersion: null, forkedFromId: null, parentThreadId, source: parentThreadId ? "subagent" : null, threadSource: null },
      sourceKind: parentThreadId ? "subagent" : "main",
      dateWindow: null,
      hasRangeActivity: true,
      rangeFirstActivityAt: item.startedAt,
      rangeLastActivityAt: item.endedAt,
      subagentBaselineApplied: Boolean(parentThreadId),
      containsFullUserMessages: true,
      cacheWriteFieldAvailable: true,
      reasoningFieldAvailable: true,
      hasToolEvents: false,
    },
    summary: {
      turnCount: 1,
      statusCounts: { complete: 1, aborted: 0, incomplete: 0 },
      zeroUsageTurns: 0,
      tokenEvents: 1,
      duplicateSnapshots: 0,
      rollbacks: 0,
      contextCompactions: 0,
      malformedLines: 0,
      blankLines: 0,
      orphanMessageCount: 0,
      counterResets: 0,
      finalUsage: item.usage,
      finalBreakdown: item.breakdown,
      finalBreakdownMismatch: 0,
      turnUsageSum: item.usage,
      unattributedUsage: usage(0),
      accountedUsage: item.usage,
      reconciliationDifference: usage(0),
      integrityErrorCount: 0,
      warningCount: 0,
      dailyUsage: item.dailyUsage,
      toolCallCount: 0,
      toolReportedCallCount: 0,
      toolUnknownCallCount: 0,
      toolUsage: usage(0),
      toolCategories: {},
    },
    warnings: [],
    orphanMessages: [],
    turns: [item],
  };
}

const projects: ProjectIdentity[] = [
  { id: "p1", label: "Alpha", rootPath: "D:/alpha", gitCommonDir: "D:/alpha/.git", worktrees: ["D:/alpha"], isGitRepository: true, sessionCount: 2, turnCount: 2, lastActivityAt: "2026-01-02T01:01:00Z", defaultSelected: true },
  { id: "p2", label: "Beta", rootPath: "D:/beta", gitCommonDir: "D:/beta/.git", worktrees: ["D:/beta"], isGitRepository: true, sessionCount: 1, turnCount: 1, lastActivityAt: "2026-01-03T01:01:00Z", defaultSelected: false },
];

describe("report aggregation", () => {
  it("defaults to the last seven calendar days and the newest active session", () => {
    const reports = [report("alpha-a", "D:/alpha", turn("a", dayAtOffset(-8), 100)), report("alpha-b", "D:/alpha", turn("b", dayAtOffset(-1), 40)), report("beta", "D:/beta", turn("c", dayAtOffset(0), 60))];
    const result = buildScopedProjectReport({
      reports,
      projects,
      projectIdByThread: new Map([["alpha-a", "p1"], ["alpha-b", "p1"], ["beta", "p2"]]),
      sourceRoots: [], parseErrors: {}, candidateRolloutCount: 3, pollIntervalMs: 3000, query: {},
    });
    expect(result.metadata.selection.range).toBe("7d");
    expect(result.metadata.selection.sessionIds).toEqual(["beta"]);
    expect(result.metadata.selection.projectIds).toEqual(["p2"]);
    expect(result.summary.finalUsage.total).toBe(60);
    expect(result.selectedSession?.metadata.threadId).toBe("beta");
    expect(result.navigationSessions.map((item) => item.metadata.threadId)).toEqual(["beta", "alpha-b", "alpha-a"]);
  });

  it("does not select an inactive session when the default seven-day range is empty", () => {
    const result = buildScopedProjectReport({
      reports: [report("old", "D:/alpha", turn("old-turn", dayAtOffset(-8), 100))],
      projects,
      projectIdByThread: new Map([["old", "p1"]]),
      sourceRoots: [], parseErrors: {}, candidateRolloutCount: 1, pollIntervalMs: 3000, query: {},
    });

    expect(result.metadata.selection).toMatchObject({ range: "7d", sessionIds: [], sessionId: null });
    expect(result.selectedSession).toBeNull();
  });

  it("aggregates an explicit cross-project session selection and preserves an explicit empty selection", () => {
    const reports = [report("alpha", "D:/alpha", turn("a", "2026-01-01", 100)), report("beta", "D:/beta", turn("b", "2026-01-02", 60))];
    const base = {
      reports,
      projects,
      projectIdByThread: new Map([["alpha", "p1"], ["beta", "p2"]]),
      sourceRoots: [], parseErrors: {}, candidateRolloutCount: 2, pollIntervalMs: 3000,
    };
    const selected = buildScopedProjectReport({ ...base, query: { selectedSessionIds: ["beta"], range: "all" as const } });
    expect(selected.metadata.selection).toMatchObject({ sessionIds: ["beta"], projectIds: ["p2"] });
    expect(selected.summary).toMatchObject({ sessionCount: 1, finalUsage: { total: 60 } });
    const empty = buildScopedProjectReport({ ...base, query: { selectedSessionIds: [], range: "all" as const } });
    expect(empty.metadata.selection.sessionIds).toEqual([]);
    expect(empty.summary).toMatchObject({ sessionCount: 0, turnCount: 0, finalUsage: { total: 0 } });
  });

  it("keeps navigation model filters independent of the selected sessions and includes Spark", () => {
    const multiModelTurn = turn("multi-turn", "2026-01-03", 20);
    multiModelTurn.models = ["gpt-5.6-sol", "gpt-5.6-luna"];
    const reports = [
      report("sol", "D:/alpha", turn("sol-turn", "2026-01-03", 100, "gpt-5.6-sol")),
      report("luna", "D:/alpha", turn("luna-turn", "2026-01-03", 60, "gpt-5.6-luna")),
      report("spark", "D:/beta", turn("spark-turn", "2026-01-03", 40, "gpt-5.3-codex-spark")),
      report("multi", "D:/beta", multiModelTurn),
    ];
    const result = buildScopedProjectReport({
      reports,
      projects,
      projectIdByThread: new Map([["sol", "p1"], ["luna", "p1"], ["spark", "p2"], ["multi", "p2"]]),
      sourceRoots: [], parseErrors: {}, candidateRolloutCount: 4, pollIntervalMs: 3000,
      query: { selectedSessionIds: ["sol"], range: "custom", from: "2026-01-03", to: "2026-01-03" },
    });

    expect(result.summary.modelUsage.map((bucket) => bucket.model)).toEqual(["GPT-5.6 Sol"]);
    expect(result.navigationModelUsage).toEqual([
      { model: "GPT-5.6 Sol", rawTokens: 100 },
      { model: "GPT-5.6 Luna", rawTokens: 60 },
      { model: "Spark", rawTokens: 40 },
      { model: "多模型", rawTokens: 20 },
    ]);
    expect(result.navigationSessions.find((session) => session.metadata.threadId === "multi")?.range.modelUsage).toEqual([{ model: "多模型", rawTokens: 20 }]);
  });

  it("keeps inactive sessions in navigation while date filtering statistics", () => {
    const reports = [report("old", "D:/alpha", turn("old-turn", "2026-01-01", 100, "gpt-5.6-luna")), report("current", "D:/alpha", turn("current-turn", "2026-01-02", 40))];
    const result = buildScopedProjectReport({
      reports,
      projects,
      projectIdByThread: new Map([["old", "p1"], ["current", "p1"]]),
      sourceRoots: [], parseErrors: {}, candidateRolloutCount: 2, pollIntervalMs: 3000,
      query: { selectedSessionIds: ["old", "current"], range: "custom", from: "2026-01-02", to: "2026-01-02", sessionId: "old" },
    });
    expect(result.summary).toMatchObject({ sessionCount: 1, turnCount: 1, finalUsage: { total: 40 } });
    expect(result.navigationSessions.find((item) => item.metadata.threadId === "old")?.range.turnCount).toBe(0);
    expect(result.navigationModelUsage).toEqual([{ model: "GPT-5.6 Sol", rawTokens: 40 }]);
    expect(result.selectedSession?.metadata.threadId).toBe("old");
    expect(result.selectedSession?.summary.turnCount).toBe(0);
  });

  it("groups subagents under the root task and keeps source semantics", () => {
    const reports = [report("root", "D:/alpha", turn("main", "2026-01-01", 100)), report("child", "D:/alpha", turn("sub", "2026-01-02", 40), "root")];
    const result = buildScopedProjectReport({
      reports,
      projects,
      projectIdByThread: new Map([["root", "p1"], ["child", "p1"]]),
      sourceRoots: [],
      parseErrors: {},
      candidateRolloutCount: 2,
      pollIntervalMs: 3000,
      query: { projectIds: ["p1"], range: "all", sessionId: "root" },
    });
    expect(result.summary.sessionCount).toBe(1);
    expect(result.selectedSession?.summary.finalUsage.total).toBe(140);
    expect(result.selectedSession?.turns.map((item) => item.sourceKind)).toEqual(["main", "subagent"]);
  });

  it("applies custom date ranges at turn start time", () => {
    const reports = [report("root", "D:/alpha", turn("main", "2026-01-01", 100)), report("child", "D:/alpha", turn("sub", "2026-01-02", 40), "root")];
    const result = buildScopedProjectReport({
      reports,
      projects,
      projectIdByThread: new Map([["root", "p1"], ["child", "p1"]]),
      sourceRoots: [],
      parseErrors: {},
      candidateRolloutCount: 2,
      pollIntervalMs: 3000,
      query: { projectIds: ["p1"], range: "custom", from: "2026-01-02", to: "2026-01-02" },
    });
    expect(result.summary.turnCount).toBe(1);
    expect(result.summary.finalUsage.total).toBe(40);
  });

  it("computes Sol-equivalent usage from official model rates", () => {
    const buckets = aggregateModelUsage([turn("terra", "2026-01-01", 100, "gpt-5.6-terra"), turn("spark", "2026-01-01", 50, "gpt-5.3-codex-spark")]);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ model: "GPT-5.6 Terra", rawTokens: 100, weightedTokens: 50 });
  });

  it("combines selected projects while keeping full messages out of the session index", () => {
    const reports = [report("alpha", "D:/alpha", turn("alpha-turn", "2026-01-01", 100)), report("beta", "D:/beta", turn("beta-turn", "2026-01-01", 60))];
    const result = buildScopedProjectReport({
      reports,
      projects,
      projectIdByThread: new Map([["alpha", "p1"], ["beta", "p2"]]),
      sourceRoots: [],
      parseErrors: {},
      candidateRolloutCount: 2,
      pollIntervalMs: 3000,
      query: { projectIds: ["p1", "p2"], range: "all", sessionId: "beta" },
    });
    expect(result.summary).toMatchObject({ sessionCount: 2, turnCount: 2, finalUsage: { total: 160 } });
    expect(result.selectedSession?.metadata.threadId).toBe("beta");
    expect(JSON.stringify(result.sessions)).not.toContain("messages");
    expect(result.selectedSession?.turns[0].messages[0].text).toBe("beta-turn");
  });

  it("uses the local session index title and never falls back to the project folder", () => {
    const indexed = report("alpha", "D:/alpha", turn("parsed prompt", "2026-01-01", 100));
    const unnamed = report("beta", "D:/beta", turn("unused", "2026-01-01", 60));
    unnamed.turns[0].messages = [];
    const result = buildScopedProjectReport({
      reports: [indexed, unnamed],
      projects,
      projectIdByThread: new Map([["alpha", "p1"], ["beta", "p2"]]),
      threadNames: new Map([["alpha", "用户重命名的会话"]]),
      sourceRoots: [],
      parseErrors: {},
      candidateRolloutCount: 2,
      pollIntervalMs: 3000,
      query: { selectedSessionIds: ["alpha", "beta"], range: "all", sessionId: "alpha" },
    });

    expect(result.navigationSessions.find((session) => session.metadata.threadId === "alpha")?.metadata.title).toBe("用户重命名的会话");
    expect(result.selectedSession?.metadata.title).toBe("用户重命名的会话");
    expect(result.navigationSessions.find((session) => session.metadata.threadId === "beta")?.metadata.title).toBe("未命名会话 · beta");
  });
});
