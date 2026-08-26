export type Usage = {
  input: number;
  cached: number;
  cache_write: number;
  output: number;
  reasoning: number;
  total: number;
};

export type WarningRecord = {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
  line?: number;
  turnId?: string;
};

export type ContextSnapshot = {
  snapshotType: "unknown" | "turn_end" | "current_latest" | "range_latest";
  tokens: number | null;
  windowTokens: number | null;
  occupancyRate: number | null;
  timestamp: string | null;
};

export type ContextTimelinePoint = {
  tokens: number;
  windowTokens: number | null;
  occupancyRate: number | null;
  timestamp: string;
  turnTokenOffset: number;
};

export type ContextCompaction = {
  timestamp: string;
  before: Omit<ContextSnapshot, "snapshotType"> | null;
  after: Omit<ContextSnapshot, "snapshotType"> | null;
  turnTokenOffset: number;
};

export type ToolCall = {
  sequence: number;
  callId: string | null;
  name: string;
  rawName: string;
  category: string;
  provider: string | null;
  semanticTool: string | null;
  classificationSource: "raw" | "explicit" | "inferred";
  transportWrapper: boolean;
  timestamp: string;
  endedAt: string | null;
  status: string;
  usage: Usage;
  usageReported: boolean;
  usageKnown: string[];
};

export type TurnMessage = {
  timestamp: string;
  text: string;
  clientId: string | null;
  imageCount: number;
  audioCount: number;
  steering?: boolean;
};

export type TurnOutput = { timestamp: string; text: string; phase: string | null };

export type TurnReport = {
  index: number;
  turnId: string;
  status: "complete" | "aborted" | "incomplete";
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  timeToFirstTokenMs: number | null;
  abortReason: string | null;
  messages: TurnMessage[];
  outputs: TurnOutput[];
  models: string[];
  efforts: string[];
  contextWindows: number[];
  tokenSnapshots: number;
  modelResponses: number;
  compactions: number;
  warnings: string[];
  usage: Usage;
  dailyUsage: Array<{ date: string; usage: Usage }>;
  dailyModelResponses: Record<string, number>;
  dailyTokenSnapshots: Record<string, number>;
  breakdown: {
    cachedInput: number;
    cacheWriteInput: number;
    otherNonCachedInput: number;
    ordinaryOutput: number;
    reasoningOutput: number;
    unclassified: number;
  };
  breakdownMismatch: number;
  rangeClipped: boolean;
  rangeFirstActivityAt: string | null;
  rangeLastActivityAt: string | null;
  contextSnapshot: ContextSnapshot;
  contextTimeline: ContextTimelinePoint[];
  contextCompactions: ContextCompaction[];
  toolCalls: ToolCall[];
  toolSummary: {
    callCount: number;
    reportedCallCount: number;
    unknownCallCount: number;
    usage: Usage;
    categories: Record<string, number>;
  };
};

export type RolloutMetadata = {
  threadId: string;
  sourcePath: string;
  sourceName: string;
  sourceBytes: number;
  sourceModifiedAt: string;
  generatedAt: string;
  sessionMeta: {
    id: string | null;
    sessionId: string | null;
    cwd: string | null;
    originator: string | null;
    cliVersion: string | null;
    forkedFromId: string | null;
    parentThreadId: string | null;
    source: string | null;
    threadSource: string | null;
  };
  sourceKind: "main" | "subagent" | "automation";
  dateWindow: null;
  hasRangeActivity: boolean;
  rangeFirstActivityAt: string | null;
  rangeLastActivityAt: string | null;
  subagentBaselineApplied: boolean;
  containsFullUserMessages: boolean;
  cacheWriteFieldAvailable: boolean;
  reasoningFieldAvailable: boolean;
  hasToolEvents: boolean;
};

export type RolloutReport = {
  schemaVersion: 1;
  generator: { name: string; version: string };
  metadata: RolloutMetadata;
  summary: {
    turnCount: number;
    statusCounts: Record<string, number>;
    zeroUsageTurns: number;
    tokenEvents: number;
    duplicateSnapshots: number;
    rollbacks: number;
    contextCompactions: number;
    malformedLines: number;
    blankLines: number;
    orphanMessageCount: number;
    counterResets: number;
    finalUsage: Usage;
    finalBreakdown: TurnReport["breakdown"];
    finalBreakdownMismatch: number;
    turnUsageSum: Usage;
    unattributedUsage: Usage;
    accountedUsage: Usage;
    reconciliationDifference: Usage;
    integrityErrorCount: number;
    warningCount: number;
    dailyUsage: Array<{ date: string; usage: Usage }>;
    toolCallCount: number;
    toolReportedCallCount: number;
    toolUnknownCallCount: number;
    toolUsage: Usage;
    toolCategories: Record<string, number>;
  };
  warnings: WarningRecord[];
  orphanMessages: TurnMessage[];
  turns: TurnReport[];
};

export type ModelRate = {
  input: number;
  cached: number;
  cacheWrite: number;
  output: number;
};

export type ModelUsageBucket = {
  model: string;
  rawTokens: number;
  weightedTokens: number;
  estimatedUsd: number;
  rateMultiplier: number | null;
  rateStatus: "official" | "fallback" | "unconfigured";
};

export type PlanExcludedUsage = {
  models: string[];
  rawTokens: number;
  turnCount: number;
};

export type RateCardMetadata = {
  source: string;
  effectiveDate: string;
  checkedAt: string;
  basis: string;
  sol: ModelRate;
};

export type ProjectIdentity = {
  id: string;
  label: string;
  rootPath: string;
  gitCommonDir: string | null;
  worktrees: string[];
  isGitRepository: boolean;
  sessionCount: number;
  turnCount: number;
  lastActivityAt: string | null;
  defaultSelected: boolean;
};

export type AggregatedTurnReport = TurnReport & {
  sourceTurnIndex: number;
  sourceRolloutId: string;
  sourceKind: RolloutMetadata["sourceKind"];
  sourceLabel: string;
  parentThreadId: string | null;
};

export type ProjectSessionSummary = {
  turnCount: number;
  statusCounts: Record<string, number>;
  zeroUsageTurns: number;
  finalUsage: Usage;
  finalBreakdown: TurnReport["breakdown"];
  contextCompactions: number;
  toolCallCount: number;
  toolReportedCallCount: number;
  toolUnknownCallCount: number;
  toolUsage: Usage;
  toolCategories: Record<string, number>;
  modelUsage: ModelUsageBucket[];
  planExcludedUsage: PlanExcludedUsage;
  dailyUsage: Array<{ date: string; usage: Usage }>;
  integrityErrorCount: number;
  warningCount: number;
};

export type ProjectSessionMetadata = {
  threadId: string;
  title: string;
  projectId: string;
  projectLabel: string;
  cwd: string | null;
  sourceKinds: RolloutMetadata["sourceKind"][];
  primaryModel: string;
  efforts: string[];
  rangeFirstActivityAt: string | null;
  rangeLastActivityAt: string | null;
  rolloutCount: number;
  sourcePaths: string[];
  cacheWriteFieldAvailable: boolean;
  reasoningFieldAvailable: boolean;
  containsFullUserMessages: true;
  subagentBaselineApplied: boolean;
};

export type ProjectSessionListItem = {
  metadata: ProjectSessionMetadata;
  summary: ProjectSessionSummary;
};

export type ProjectSession = ProjectSessionListItem & {
  warnings: WarningRecord[];
  turns: AggregatedTurnReport[];
};

export type SessionNavigationItem = {
  metadata: {
    threadId: string;
    title: string;
    projectId: string;
    projectLabel: string;
    primaryModel: string;
    efforts: string[];
    sourceKinds: RolloutMetadata["sourceKind"][];
    rolloutCount: number;
    firstActivityAt: string | null;
    lastActivityAt: string | null;
  };
  total: { turnCount: number; usage: Usage };
  range: { turnCount: number; usage: Usage; lastActivityAt: string | null; modelUsage: NavigationModelUsageBucket[] };
};

export type NavigationModelUsageBucket = {
  model: string;
  rawTokens: number;
};

export type ReportSelection = {
  projectIds: string[];
  sessionIds: string[];
  range: "today" | "7d" | "30d" | "all" | "custom";
  from: string | null;
  to: string | null;
  sessionId: string | null;
  timeZone: string;
  label: string;
};

export type ProjectReport = {
  mode: "project";
  generator: { name: string; version: string };
  metadata: {
    generatedAt: string;
    sourceRoots: string[];
    projects: ProjectIdentity[];
    selection: ReportSelection;
    scope: { type: "projects-and-date"; label: string };
    rateCard: RateCardMetadata;
    live: {
      enabled: true;
      pollIntervalMs: number;
      lastPollAt: string;
      status: "ok" | "degraded" | "empty";
      parseErrors: Record<string, string>;
      candidateRolloutCount: number;
      selectedRolloutCount: number;
    };
  };
  summary: {
    sessionCount: number;
    turnCount: number;
    finalUsage: Usage;
    finalBreakdown: TurnReport["breakdown"];
    statusCounts: Record<string, number>;
    toolCallCount: number;
    toolUsage: Usage;
    integrityErrorCount: number;
    warningCount: number;
    dailyUsage: Array<{ date: string; usage: Usage }>;
    modelUsage: ModelUsageBucket[];
    planExcludedUsage: PlanExcludedUsage;
  };
  warnings: WarningRecord[];
  navigationModelUsage: NavigationModelUsageBucket[];
  navigationSessions: SessionNavigationItem[];
  sessions: ProjectSessionListItem[];
  selectedSession: ProjectSession | null;
};

export type LiveSnapshot = {
  report: ProjectReport;
  server: {
    defaultProjectRoot: string;
    sessionRoots: string[];
    pollIntervalMs: number;
    polledAt: string;
    changed: boolean;
  };
};
