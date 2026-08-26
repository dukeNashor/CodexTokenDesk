import { addUsage, sessionTitle } from "@/lib/rollout-parser";
import type {
  AggregatedTurnReport,
  ModelRate,
  ModelUsageBucket,
  PlanExcludedUsage,
  ProjectIdentity,
  ProjectReport,
  ProjectSession,
  ProjectSessionSummary,
  RateCardMetadata,
  RolloutReport,
  SessionNavigationItem,
  TurnReport,
  Usage,
  WarningRecord,
} from "@/lib/types";

export type ReportQuery = {
  projectIds?: string[];
  selectedSessionIds?: string[];
  range?: "today" | "7d" | "30d" | "all" | "custom";
  from?: string | null;
  to?: string | null;
  sessionId?: string | null;
};

type BuildReportInput = {
  reports: Iterable<RolloutReport>;
  projects: ProjectIdentity[];
  projectIdByThread: Map<string, string>;
  threadNames?: ReadonlyMap<string, string>;
  sourceRoots: string[];
  parseErrors: Record<string, string>;
  candidateRolloutCount: number;
  pollIntervalMs: number;
  query: ReportQuery;
};

const OFFICIAL_RATE_SOURCE = "https://developers.openai.com/api/docs/models/gpt-5.6-sol";
const SOL_RATE: ModelRate = { input: 4, cached: 0.4, cacheWrite: 5, output: 20 };
const RATE_CARD: Record<string, { label: string; rate: ModelRate }> = {
  "gpt-5.6-sol": { label: "GPT-5.6 Sol", rate: SOL_RATE },
  "gpt-5.6": { label: "GPT-5.6 Sol", rate: SOL_RATE },
  "gpt-5.6-terra": { label: "GPT-5.6 Terra", rate: { input: 2, cached: 0.2, cacheWrite: 2.5, output: 12 } },
  "gpt-5.6-luna": { label: "GPT-5.6 Luna", rate: { input: 0.2, cached: 0.02, cacheWrite: 0.25, output: 1.2 } },
  "gpt-5.5": { label: "GPT-5.5", rate: { input: 5, cached: 0.5, cacheWrite: 5, output: 30 } },
  "gpt-5.4": { label: "GPT-5.4", rate: { input: 2.5, cached: 0.25, cacheWrite: 2.5, output: 15 } },
  "gpt-5.4-mini": { label: "GPT-5.4 mini", rate: { input: 0.75, cached: 0.075, cacheWrite: 0.75, output: 4.5 } },
  "gpt-5.3-codex": { label: "GPT-5.3 Codex", rate: { input: 1.75, cached: 0.175, cacheWrite: 1.75, output: 14 } },
  "gpt-5.2": { label: "GPT-5.2", rate: { input: 1.75, cached: 0.175, cacheWrite: 1.75, output: 14 } },
};
const PLAN_EXCLUDED_MODELS = new Set(["gpt-5.3-codex-spark"]);

export const RATE_CARD_METADATA: RateCardMetadata = {
  source: OFFICIAL_RATE_SOURCE,
  effectiveDate: "2026-08-24",
  checkedAt: "2026-08-24T00:00:00+08:00",
  basis: "公开 API 文本 Token 费率；长上下文、区域处理和工具调用附加费未计入",
  sol: SOL_RATE,
};

const zeroUsage = (): Usage => ({ input: 0, cached: 0, cache_write: 0, output: 0, reasoning: 0, total: 0 });
const dayFormatters = new Map<string, Intl.DateTimeFormat>();

function normalizedModel(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, "");
}

function modelNames(turn: TurnReport): string[] {
  return [...new Set(turn.models.map((value) => value.trim()).filter(Boolean))];
}

function isPlanExcluded(value: string): boolean {
  return PLAN_EXCLUDED_MODELS.has(normalizedModel(value));
}

function rateForModel(value: string): { label: string; rate: ModelRate; status: ModelUsageBucket["rateStatus"] } {
  const configured = RATE_CARD[normalizedModel(value)];
  return configured ? { ...configured, status: "official" } : { label: value || "未知模型", rate: SOL_RATE, status: "unconfigured" };
}

export function aggregateModelUsage(turns: TurnReport[]): ModelUsageBucket[] {
  const buckets = new Map<string, ModelUsageBucket>();
  for (const turn of turns) {
    const rawNames = modelNames(turn);
    const names = rawNames.filter((name) => !isPlanExcluded(name));
    if (!names.length && rawNames.length) continue;
    const selected = names.length === 1 ? rateForModel(names[0]) : names.length > 1
      ? { label: "多模型", rate: SOL_RATE, status: "fallback" as const }
      : { label: "未知模型", rate: SOL_RATE, status: "unconfigured" as const };
    const cached = Math.max(0, turn.breakdown.cachedInput);
    const cacheWrite = Math.max(0, turn.breakdown.cacheWriteInput);
    const otherInput = Math.max(0, turn.breakdown.otherNonCachedInput);
    const output = Math.max(0, turn.breakdown.ordinaryOutput + turn.breakdown.reasoningOutput + turn.breakdown.unclassified);
    const estimatedUsd = (otherInput * selected.rate.input + cached * selected.rate.cached + cacheWrite * selected.rate.cacheWrite + output * selected.rate.output) / 1_000_000;
    const weightedTokens = otherInput * selected.rate.input / SOL_RATE.input
      + cached * selected.rate.cached / SOL_RATE.cached
      + cacheWrite * selected.rate.cacheWrite / SOL_RATE.cacheWrite
      + output * selected.rate.output / SOL_RATE.output;
    const ratios = [selected.rate.input / SOL_RATE.input, selected.rate.cached / SOL_RATE.cached, selected.rate.cacheWrite / SOL_RATE.cacheWrite, selected.rate.output / SOL_RATE.output];
    const multiplier = Math.max(...ratios) - Math.min(...ratios) < 1e-9 ? ratios[0] : null;
    const bucket = buckets.get(selected.label) ?? {
      model: selected.label,
      rawTokens: 0,
      weightedTokens: 0,
      estimatedUsd: 0,
      rateMultiplier: multiplier,
      rateStatus: selected.status,
    };
    bucket.rawTokens += turn.usage.total;
    bucket.weightedTokens += weightedTokens;
    bucket.estimatedUsd += estimatedUsd;
    if (bucket.rateStatus === "official" && selected.status !== "official") bucket.rateStatus = selected.status;
    buckets.set(selected.label, bucket);
  }
  return [...buckets.values()]
    .map((bucket) => ({ ...bucket, weightedTokens: Math.round(bucket.weightedTokens * 10_000) / 10_000, estimatedUsd: Math.round(bucket.estimatedUsd * 1_000_000) / 1_000_000 }))
    .sort((left, right) => right.weightedTokens - left.weightedTokens || left.model.localeCompare(right.model));
}

export function aggregatePlanExcludedUsage(turns: TurnReport[]): PlanExcludedUsage {
  const models = new Set<string>();
  let rawTokens = 0;
  let turnCount = 0;
  for (const turn of turns) {
    const names = modelNames(turn);
    if (!names.length || names.some((name) => !isPlanExcluded(name))) continue;
    names.forEach(() => models.add("Spark"));
    rawTokens += turn.usage.total;
    turnCount += 1;
  }
  return { models: [...models].sort(), rawTokens, turnCount };
}

function localDay(timestamp: string, timeZone: string): string | null {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(parsed);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.year && values.month && values.day ? `${values.year}-${values.month}-${values.day}` : null;
}

function modelFilterLabel(turn: TurnReport): string {
  const names = modelNames(turn);
  if (!names.length) return "未知模型";
  if (names.length > 1) return "多模型";
  return isPlanExcluded(names[0]) ? "Spark" : rateForModel(names[0]).label;
}

function aggregateNavigationModelUsage(turns: TurnReport[]) {
  const buckets = new Map<string, number>();
  for (const turn of turns) {
    const model = modelFilterLabel(turn);
    buckets.set(model, (buckets.get(model) ?? 0) + turn.usage.total);
  }
  return [...buckets.entries()]
    .map(([model, rawTokens]) => ({ model, rawTokens }))
    .sort((left, right) => right.rawTokens - left.rawTokens || left.model.localeCompare(right.model));
}

function today(timeZone: string): string {
  return localDay(new Date().toISOString(), timeZone) ?? new Date().toISOString().slice(0, 10);
}

function shiftDay(day: string, amount: number): string {
  const parsed = new Date(`${day}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + amount);
  return parsed.toISOString().slice(0, 10);
}

function resolveDateSelection(query: ReportQuery, timeZone: string) {
  const range = query.range ?? "7d";
  const current = today(timeZone);
  if (range === "all") return { range, from: null, to: null } as const;
  if (range === "7d") return { range, from: shiftDay(current, -6), to: current } as const;
  if (range === "30d") return { range, from: shiftDay(current, -29), to: current } as const;
  if (range === "custom" && /^\d{4}-\d{2}-\d{2}$/.test(query.from ?? "") && /^\d{4}-\d{2}-\d{2}$/.test(query.to ?? "")) {
    const from = query.from as string;
    const to = query.to as string;
    return from <= to ? { range, from, to } as const : { range, from: to, to: from } as const;
  }
  return { range: "today" as const, from: current, to: current };
}

function turnInDate(turn: TurnReport, timeZone: string, from: string | null, to: string | null): boolean {
  if (!from || !to) return true;
  const day = localDay(turn.startedAt, timeZone);
  return Boolean(day && day >= from && day <= to);
}

function rootThreadId(report: RolloutReport, reportsById: Map<string, RolloutReport>): string {
  let id = report.metadata.threadId.toLowerCase();
  const seen = new Set<string>();
  let current = report;
  while (id && !seen.has(id)) {
    seen.add(id);
    const parent = current.metadata.sessionMeta.parentThreadId || current.metadata.sessionMeta.forkedFromId;
    if (!parent) return id;
    id = parent.toLowerCase();
    const next = reportsById.get(id);
    if (!next) return id;
    current = next;
  }
  return id || report.metadata.threadId.toLowerCase();
}

function sourceLabel(report: RolloutReport): string {
  if (report.metadata.sourceKind === "subagent") return `子代理 ${report.metadata.threadId.slice(0, 8)}`;
  if (report.metadata.sourceKind === "automation") return "自动化";
  return "主会话";
}

function breakdownForTurns(turns: TurnReport[]): TurnReport["breakdown"] {
  return turns.reduce<TurnReport["breakdown"]>((sum, turn) => ({
    cachedInput: sum.cachedInput + turn.breakdown.cachedInput,
    cacheWriteInput: sum.cacheWriteInput + turn.breakdown.cacheWriteInput,
    otherNonCachedInput: sum.otherNonCachedInput + turn.breakdown.otherNonCachedInput,
    ordinaryOutput: sum.ordinaryOutput + turn.breakdown.ordinaryOutput,
    reasoningOutput: sum.reasoningOutput + turn.breakdown.reasoningOutput,
    unclassified: sum.unclassified + turn.breakdown.unclassified,
  }), { cachedInput: 0, cacheWriteInput: 0, otherNonCachedInput: 0, ordinaryOutput: 0, reasoningOutput: 0, unclassified: 0 });
}

function usageForTurns(turns: TurnReport[]): Usage {
  return turns.reduce((sum, turn) => addUsage(sum, turn.usage), zeroUsage());
}

function dailyUsageForTurns(turns: TurnReport[], timeZone: string): Array<{ date: string; usage: Usage }> {
  const daily = new Map<string, Usage>();
  for (const turn of turns) {
    const day = localDay(turn.startedAt, timeZone);
    if (day) daily.set(day, addUsage(daily.get(day) ?? zeroUsage(), turn.usage));
  }
  return [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, usage]) => ({ date, usage }));
}

function statusCounts(turns: TurnReport[]): Record<string, number> {
  const counts: Record<string, number> = { complete: 0, aborted: 0, incomplete: 0 };
  turns.forEach((turn) => { counts[turn.status] = (counts[turn.status] ?? 0) + 1; });
  return counts;
}

function summarizeTurns(turns: AggregatedTurnReport[], warnings: WarningRecord[], timeZone: string): ProjectSessionSummary {
  let toolUsage = zeroUsage();
  let toolCallCount = 0;
  let toolReportedCallCount = 0;
  const toolCategories: Record<string, number> = {};
  for (const turn of turns) {
    toolUsage = addUsage(toolUsage, turn.toolSummary.usage);
    toolCallCount += turn.toolSummary.callCount;
    toolReportedCallCount += turn.toolSummary.reportedCallCount;
    for (const [category, count] of Object.entries(turn.toolSummary.categories)) toolCategories[category] = (toolCategories[category] ?? 0) + count;
  }
  return {
    turnCount: turns.length,
    statusCounts: statusCounts(turns),
    zeroUsageTurns: turns.filter((turn) => turn.usage.total === 0).length,
    finalUsage: usageForTurns(turns),
    finalBreakdown: breakdownForTurns(turns),
    contextCompactions: turns.reduce((sum, turn) => sum + turn.compactions, 0),
    toolCallCount,
    toolReportedCallCount,
    toolUnknownCallCount: toolCallCount - toolReportedCallCount,
    toolUsage,
    toolCategories,
    modelUsage: aggregateModelUsage(turns),
    planExcludedUsage: aggregatePlanExcludedUsage(turns),
    dailyUsage: dailyUsageForTurns(turns, timeZone),
    integrityErrorCount: warnings.filter((warning) => warning.severity === "error").length,
    warningCount: warnings.length,
  };
}

function mergeSessionSummaries(sessions: ProjectSession[], timeZone: string): ProjectSessionSummary {
  const turns = sessions.flatMap((session) => session.turns);
  const warnings = sessions.flatMap((session) => session.warnings);
  return summarizeTurns(turns, warnings, timeZone);
}

function selectionLabel(projects: ProjectIdentity[], sessionCount: number, from: string | null, to: string | null): string {
  const project = !sessionCount ? "尚未选择会话" : projects.length === 1 ? projects[0].label : `${projects.length} 个项目`;
  const date = !from || !to ? "全部时间" : from === to ? from : `${from} 至 ${to}`;
  return sessionCount ? `${project} · ${sessionCount} 个会话 · ${date}` : `${project} · ${date}`;
}

export function buildScopedProjectReport(input: BuildReportInput): ProjectReport {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const date = resolveDateSelection(input.query, timeZone);
  const reports = [...input.reports];
  const reportsById = new Map(reports.map((report) => [report.metadata.threadId.toLowerCase(), report]));
  const groups = new Map<string, RolloutReport[]>();
  for (const report of reports) {
    const assigned = input.projectIdByThread.get(report.metadata.threadId.toLowerCase());
    if (!assigned) continue;
    const root = rootThreadId(report, reportsById);
    const members = groups.get(root) ?? [];
    members.push(report);
    groups.set(root, members);
  }

  const groupDetails = new Map<string, { members: RolloutReport[]; project: ProjectIdentity; root: RolloutReport; title: string; allTurns: AggregatedTurnReport[]; rangeTurns: AggregatedTurnReport[]; warnings: WarningRecord[] }>();
  for (const [rootId, members] of groups) {
    const root = reportsById.get(rootId) ?? members.find((member) => member.metadata.sourceKind === "main") ?? members[0];
    const projectId = input.projectIdByThread.get(root.metadata.threadId.toLowerCase()) ?? input.projectIdByThread.get(members[0].metadata.threadId.toLowerCase());
    if (!projectId) continue;
    const project = input.projects.find((candidate) => candidate.id === projectId);
    if (!project) continue;
    const allTurns = members.flatMap((member) => member.turns
      .map<AggregatedTurnReport>((turn) => ({
        ...turn,
        sourceTurnIndex: turn.index,
        sourceRolloutId: member.metadata.threadId,
        sourceKind: member.metadata.sourceKind,
        sourceLabel: sourceLabel(member),
        parentThreadId: member.metadata.sessionMeta.parentThreadId,
      })))
      .sort((left, right) => (left.contextSnapshot.timestamp || left.endedAt || left.startedAt).localeCompare(right.contextSnapshot.timestamp || right.endedAt || right.startedAt) || left.sourceRolloutId.localeCompare(right.sourceRolloutId) || left.sourceTurnIndex - right.sourceTurnIndex)
      .map((turn, index) => ({ ...turn, index: index + 1 }));
    const rangeTurns = allTurns.filter((turn) => turnInDate(turn, timeZone, date.from, date.to)).map((turn, index) => ({ ...turn, index: index + 1 }));
    const warnings = members.flatMap((member) => member.warnings.map((warning) => ({ ...warning, message: `${member.metadata.sourceName}: ${warning.message}` })));
    const title = input.threadNames?.get(rootId.toLowerCase())?.trim() || sessionTitle(root);
    groupDetails.set(rootId, { members, project, root, title, allTurns, rangeTurns, warnings });
  }

  const navigationSessions: SessionNavigationItem[] = [...groupDetails.entries()].map(([rootId, group]) => {
    const modelUsage = aggregateModelUsage(group.allTurns);
    const planExcludedUsage = aggregatePlanExcludedUsage(group.allTurns);
    const primaryModel = modelUsage[0]?.model ?? (planExcludedUsage.rawTokens ? "Spark" : "未知模型");
    const allStarted = group.allTurns.map((turn) => turn.startedAt).filter(Boolean).sort();
    const allEnded = group.allTurns.map((turn) => turn.endedAt || turn.startedAt).filter(Boolean).sort();
    const rangeEnded = group.rangeTurns.map((turn) => turn.endedAt || turn.startedAt).filter(Boolean).sort();
    return {
      metadata: {
        threadId: rootId,
        title: group.title,
        projectId: group.project.id,
        projectLabel: group.project.label,
        primaryModel,
        efforts: [...new Set(group.allTurns.flatMap((turn) => turn.efforts))],
        sourceKinds: [...new Set(group.members.map((member) => member.metadata.sourceKind))].sort(),
        rolloutCount: group.members.length,
        firstActivityAt: allStarted[0] ?? null,
        lastActivityAt: allEnded.at(-1) ?? null,
      },
      total: { turnCount: group.allTurns.length, usage: usageForTurns(group.allTurns) },
      range: { turnCount: group.rangeTurns.length, usage: usageForTurns(group.rangeTurns), lastActivityAt: rangeEnded.at(-1) ?? null, modelUsage: aggregateNavigationModelUsage(group.rangeTurns) },
    };
  }).sort((left, right) => (right.metadata.lastActivityAt ?? "").localeCompare(left.metadata.lastActivityAt ?? "") || left.metadata.title.localeCompare(right.metadata.title));

  const navigationIds = new Set(navigationSessions.map((session) => session.metadata.threadId));
  const knownProjectIds = new Set(input.projects.map((project) => project.id));
  const requestedProjects = [...new Set(input.query.projectIds?.filter((id) => knownProjectIds.has(id)) ?? [])];
  let requestedSessionIds: string[];
  if (input.query.selectedSessionIds !== undefined) {
    const normalized = new Set(input.query.selectedSessionIds.map((id) => id.toLowerCase()));
    requestedSessionIds = navigationSessions.filter((session) => normalized.has(session.metadata.threadId)).map((session) => session.metadata.threadId);
  } else if (requestedProjects.length) {
    const projectSet = new Set(requestedProjects);
    requestedSessionIds = navigationSessions.filter((session) => projectSet.has(session.metadata.projectId)).map((session) => session.metadata.threadId);
  } else {
    const latestActive = navigationSessions
      .filter((session) => session.range.turnCount > 0)
      .sort((left, right) => (right.range.lastActivityAt ?? "").localeCompare(left.range.lastActivityAt ?? ""))[0];
    requestedSessionIds = latestActive ? [latestActive.metadata.threadId] : [];
  }
  const selectedSessionIdSet = new Set(requestedSessionIds);
  const projectIds = input.projects.filter((project) => navigationSessions.some((session) => selectedSessionIdSet.has(session.metadata.threadId) && session.metadata.projectId === project.id)).map((project) => project.id);
  const selectedProjects = input.projects.filter((project) => projectIds.includes(project.id));

  function projectSession(rootId: string): ProjectSession | null {
    const group = groupDetails.get(rootId);
    if (!group) return null;
    const turns = group.rangeTurns;
    const warnings = turns.length ? group.warnings : [];
    const summary = summarizeTurns(turns, warnings, timeZone);
    const totalSummary = turns.length ? summary : summarizeTurns(group.allTurns, group.warnings, timeZone);
    const primaryModel = totalSummary.modelUsage[0]?.model ?? (totalSummary.planExcludedUsage.rawTokens ? "Spark" : "未知模型");
    const started = turns.map((turn) => turn.startedAt).filter(Boolean).sort();
    const ended = turns.map((turn) => turn.endedAt || turn.startedAt).filter(Boolean).sort();
    return {
      metadata: {
        threadId: rootId,
        title: group.title,
        projectId: group.project.id,
        projectLabel: group.project.label,
        cwd: group.root.metadata.sessionMeta.cwd,
        sourceKinds: [...new Set(group.members.map((member) => member.metadata.sourceKind))].sort(),
        primaryModel,
        efforts: [...new Set((turns.length ? turns : group.allTurns).flatMap((turn) => turn.efforts))],
        rangeFirstActivityAt: started[0] ?? null,
        rangeLastActivityAt: ended.at(-1) ?? null,
        rolloutCount: group.members.length,
        sourcePaths: group.members.map((member) => member.metadata.sourcePath),
        cacheWriteFieldAvailable: group.members.some((member) => member.metadata.cacheWriteFieldAvailable),
        reasoningFieldAvailable: group.members.some((member) => member.metadata.reasoningFieldAvailable),
        containsFullUserMessages: true,
        subagentBaselineApplied: group.members.filter((member) => member.metadata.sourceKind === "subagent").every((member) => member.metadata.subagentBaselineApplied),
      },
      summary,
      warnings,
      turns,
    };
  }

  const sessions = requestedSessionIds.map(projectSession).filter((session): session is ProjectSession => Boolean(session?.turns.length));
  const openedId = input.query.sessionId?.toLowerCase();
  const selectedSession = (openedId && navigationIds.has(openedId) ? projectSession(openedId) : null) ?? sessions[0] ?? null;
  const summary = mergeSessionSummaries(sessions, timeZone);
  const generatedAt = new Date().toISOString();
  const allWarnings = sessions.flatMap((session) => session.warnings).slice(0, 500);
  const label = selectionLabel(selectedProjects, requestedSessionIds.length, date.from, date.to);
  return {
    mode: "project",
    generator: { name: "codex-token-desk", version: "4.0.0-ts" },
    metadata: {
      generatedAt,
      sourceRoots: input.sourceRoots,
      projects: input.projects,
      selection: { projectIds, sessionIds: requestedSessionIds, range: date.range, from: date.from, to: date.to, sessionId: selectedSession?.metadata.threadId ?? null, timeZone, label },
      scope: { type: "projects-and-date", label },
      rateCard: RATE_CARD_METADATA,
      live: {
        enabled: true,
        pollIntervalMs: input.pollIntervalMs,
        lastPollAt: generatedAt,
        status: Object.keys(input.parseErrors).length ? "degraded" : sessions.length ? "ok" : "empty",
        parseErrors: input.parseErrors,
        candidateRolloutCount: input.candidateRolloutCount,
        selectedRolloutCount: requestedSessionIds.reduce((sum, id) => sum + (groupDetails.get(id)?.members.length ?? 0), 0),
      },
    },
    summary: {
      sessionCount: sessions.length,
      turnCount: summary.turnCount,
      finalUsage: summary.finalUsage,
      finalBreakdown: summary.finalBreakdown,
      statusCounts: summary.statusCounts,
      toolCallCount: summary.toolCallCount,
      toolUsage: summary.toolUsage,
      integrityErrorCount: summary.integrityErrorCount,
      warningCount: summary.warningCount,
      dailyUsage: summary.dailyUsage,
      modelUsage: summary.modelUsage,
      planExcludedUsage: summary.planExcludedUsage,
    },
    warnings: allWarnings,
    navigationModelUsage: aggregateNavigationModelUsage([...groupDetails.values()].flatMap((group) => group.rangeTurns)),
    navigationSessions,
    sessions: sessions.map(({ metadata, summary: sessionSummary }) => ({ metadata, summary: sessionSummary })),
    selectedSession,
  };
}
