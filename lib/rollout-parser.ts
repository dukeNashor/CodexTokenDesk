import fs from "node:fs";
import path from "node:path";

import type {
  ContextCompaction,
  ContextSnapshot,
  RolloutReport,
  ToolCall,
  TurnMessage,
  TurnOutput,
  TurnReport,
  Usage,
  WarningRecord,
} from "@/lib/types";

export const PARSER_VERSION = "3.0.0-ts";

const TOOL_EVENT_TYPES = new Set([
  "tool_call", "tool_use", "function_call", "custom_tool_call", "computer_call",
  "browser_call", "browser_use", "image_generation_call", "mcp_tool_call",
  "tool_result", "tool_output", "function_call_output", "custom_tool_call_output",
  "web_search_end", "mcp_tool_call_begin", "mcp_tool_call_end",
]);

const SKY_UI_CALL = /\bsky\s*\.\s*(?:activate_window|click|double_click|drag|get_window|get_window_state|key|launch_app|list_apps|list_windows|press|scroll|type)\s*\(/;

type JsonRecord = Record<string, unknown>;
type RolloutRecord = { timestamp?: unknown; type?: unknown; payload?: unknown };

type MutableTurn = {
  index: number;
  turnId: string;
  startedAt: string;
  startedLine: number;
  startUsage: Usage;
  endUsage: Usage;
  status: "complete" | "aborted" | "incomplete";
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
  warningCodes: string[];
  dailyUsage: Map<string, Usage>;
  dailyModelResponses: Map<string, number>;
  dailyTokenSnapshots: Map<string, number>;
  latestContextSnapshot: RawContextSnapshot | null;
  contextTimeline: Array<RawContextSnapshot & { turnTokenOffset: number }>;
  contextCompactions: ContextCompaction[];
  toolCalls: ToolCall[];
  rangeUsage: Usage;
  rangeRelevant: boolean;
  rangeFirstActivityAt: string | null;
  rangeLastActivityAt: string | null;
  messageEvents: number;
};

type RawContextSnapshot = { tokens: number; windowTokens: number | null; timestamp: string };

type ToolEvent = {
  eventType: string;
  callId: string | null;
  rawName: string;
  category: string;
  provider: string | null;
  semanticTool: string | null;
  classificationSource: "raw" | "explicit" | "inferred";
  transportWrapper: boolean;
  usage: Usage;
  usageReported: boolean;
  usageKnown: Set<string>;
  isResult: boolean;
  status: string;
};

const zeroUsage = (): Usage => ({ input: 0, cached: 0, cache_write: 0, output: 0, reasoning: 0, total: 0 });

export function addUsage(left: Usage, right: Usage): Usage {
  return {
    input: left.input + right.input,
    cached: left.cached + right.cached,
    cache_write: left.cache_write + right.cache_write,
    output: left.output + right.output,
    reasoning: left.reasoning + right.reasoning,
    total: left.total + right.total,
  };
}

export function subtractUsage(left: Usage, right: Usage): Usage {
  return {
    input: left.input - right.input,
    cached: left.cached - right.cached,
    cache_write: left.cache_write - right.cache_write,
    output: left.output - right.output,
    reasoning: left.reasoning - right.reasoning,
    total: left.total - right.total,
  };
}

function clampUsage(value: Usage): Usage {
  return {
    input: Math.max(0, value.input),
    cached: Math.max(0, value.cached),
    cache_write: Math.max(0, value.cache_write),
    output: Math.max(0, value.output),
    reasoning: Math.max(0, value.reasoning),
    total: Math.max(0, value.total),
  };
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const rendered = text(value).trim();
    if (rendered) return rendered;
  }
  return "";
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function nonNegative(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function parseTimestamp(value: string): number | null {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function localDay(timestamp: string): string | null {
  const parsed = parseTimestamp(timestamp);
  return parsed === null ? null : new Date(parsed).toLocaleDateString("en-CA");
}

function usageFromPayload(value: unknown): { usage: Usage; present: boolean; known: Set<string> } {
  const payload = record(value);
  const aliases: Record<keyof Usage, string[]> = {
    input: ["input_tokens", "inputTokens", "input"],
    cached: ["cached_input_tokens", "cachedInputTokens", "cached"],
    cache_write: ["cache_write_input_tokens", "cacheWriteInputTokens", "cache_write", "cacheWrite"],
    output: ["output_tokens", "outputTokens", "output"],
    reasoning: ["reasoning_output_tokens", "reasoningOutputTokens", "reasoning_tokens", "reasoningTokens", "reasoning"],
    total: ["total_tokens", "totalTokens", "total"],
  };
  const usage = zeroUsage();
  const known = new Set<string>();
  for (const key of Object.keys(aliases) as Array<keyof Usage>) {
    const found = aliases[key].find((candidate) => candidate in payload);
    if (found) {
      usage[key] = nonNegative(payload[found]);
      known.add(key);
    }
  }
  if (!known.size) return { usage, present: false, known };
  if (known.has("input") && known.has("output") && !known.has("total")) {
    usage.total = usage.input + usage.output;
    known.add("total");
  }
  return { usage, present: true, known };
}

function usageBreakdown(usage: Usage, cacheWriteAvailable: boolean): { breakdown: TurnReport["breakdown"]; mismatch: number } {
  const cachedInput = Math.min(usage.cached, usage.input);
  const remainingInput = Math.max(0, usage.input - cachedInput);
  const cacheWriteInput = cacheWriteAvailable ? Math.min(usage.cache_write, remainingInput) : 0;
  const otherNonCachedInput = Math.max(0, remainingInput - cacheWriteInput);
  const reasoningOutput = Math.min(usage.reasoning, usage.output);
  const ordinaryOutput = Math.max(0, usage.output - reasoningOutput);
  const known = cachedInput + cacheWriteInput + otherNonCachedInput + ordinaryOutput + reasoningOutput;
  const unclassified = Math.max(0, usage.total - known);
  return {
    breakdown: { cachedInput, cacheWriteInput, otherNonCachedInput, ordinaryOutput, reasoningOutput, unclassified },
    mismatch: known + unclassified - usage.total,
  };
}

function snapshotPayload(snapshot: RawContextSnapshot | null): Omit<ContextSnapshot, "snapshotType"> | null {
  if (!snapshot) return null;
  return {
    tokens: snapshot.tokens,
    windowTokens: snapshot.windowTokens,
    occupancyRate: snapshot.windowTokens ? Math.round((10000 * snapshot.tokens) / snapshot.windowTokens) / 100 : null,
    timestamp: snapshot.timestamp,
  };
}

function responseText(payload: JsonRecord): string {
  const direct = firstText(payload.text, payload.message, payload.output);
  if (direct) return direct;
  const content = payload.content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      const item = record(part);
      return firstText(item.text, item.content);
    }).filter(Boolean).join("\n");
  }
  return "";
}

function toolCategory(rawName: string, eventType: string, semanticTool: string | null, provider: string | null): string {
  const rendered = `${rawName} ${eventType} ${semanticTool ?? ""} ${provider ?? ""}`.toLowerCase().replaceAll("_", "-");
  if (rendered.includes("image")) return "imagegen";
  if (rendered.includes("computer")) return "computer-use";
  if (rendered.includes("chrome") || rendered.includes("browser")) return "chrome-use";
  if (rendered.includes("exec") && rendered.includes("reason")) return "exec-reasoning";
  if (rendered.includes("shell") || rendered.includes("terminal") || rendered.includes("command")) return "shell";
  if (rendered.includes("code-interpreter") || rendered.includes("python")) return "code-interpreter";
  if (rendered.includes("web-search") || rendered.includes("search")) return "web-search";
  if (rendered.includes("file-search") || rendered.includes("retrieval")) return "file-search";
  if (rendered.includes("mcp")) return "mcp";
  if (rendered.includes("function") || rendered.includes("custom-tool")) return "function-calling";
  return "other";
}

function serializedText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    try { return JSON.stringify(value); } catch { return ""; }
  }
  return text(value);
}

function toolSemantics(payload: JsonRecord, item: JsonRecord, invocation: JsonRecord, rawName: string, effectiveType: string): {
  provider: string | null;
  semanticTool: string | null;
  classificationSource: ToolEvent["classificationSource"];
  transportWrapper: boolean;
} {
  let provider = firstText(
    payload.provider, payload.provider_name, payload.providerName,
    item.provider, item.provider_name, item.providerName, item.server,
    invocation.provider, invocation.server,
  ) || null;
  let semanticTool = firstText(
    payload.semantic_tool, payload.semanticTool, payload.semantic,
    item.semantic_tool, item.semanticTool, item.semantic,
    invocation.semantic_tool, invocation.semanticTool,
  ) || null;
  let classificationSource: ToolEvent["classificationSource"] = provider || semanticTool ? "explicit" : "raw";
  if ((effectiveType.includes("mcp") || provider) && !semanticTool) {
    semanticTool = rawName || null;
    classificationSource = "explicit";
  }

  const invocationArguments = record(invocation.arguments);
  const payloadArguments = record(payload.arguments);
  const itemArguments = record(item.arguments);
  const code = firstText(invocationArguments.code, payloadArguments.code, itemArguments.code, payload.code, item.code);
  if (provider?.toLowerCase() === "node_repl" && semanticTool?.toLowerCase() === "js" && SKY_UI_CALL.test(code)) {
    return { provider: "sky", semanticTool: "computer-use", classificationSource: "inferred", transportWrapper: false };
  }

  const input = [payload.input, item.input, invocation.arguments].map(serializedText).join(" ");
  const transportWrapper = ["exec", "js"].includes(rawName.toLowerCase()) && input.includes("mcp__");
  return { provider, semanticTool, classificationSource, transportWrapper };
}

function extractToolUsage(payload: JsonRecord): { usage: Usage; present: boolean; known: Set<string> } {
  const candidates: unknown[] = [payload, payload.usage, payload.token_usage, payload.tokenUsage, payload.tool_usage, payload.toolUsage, payload.info];
  for (const key of ["item", "tool_call", "call", "result", "output"]) {
    const nested = record(payload[key]);
    candidates.push(nested, nested.usage, nested.token_usage, nested.tokenUsage, nested.tool_usage, nested.toolUsage);
  }
  for (const candidate of candidates) {
    const extracted = usageFromPayload(candidate);
    if (extracted.present) return extracted;
  }
  return { usage: zeroUsage(), present: false, known: new Set<string>() };
}

function extractToolEvent(recordType: string, payload: JsonRecord): ToolEvent | null {
  const recordName = recordType.toLowerCase();
  const eventType = text(payload.type).toLowerCase();
  const item = record(payload.item);
  const itemType = text(item.type).toLowerCase();
  const effectiveType = itemType || eventType || recordName;
  if (!TOOL_EVENT_TYPES.has(effectiveType) && !["tool_call", "tool_result", "tool_output"].includes(recordName)) return null;
  const nestedTool = record(item.tool);
  const nestedFunction = record(item.function);
  const invocation = record(payload.invocation);
  const action = record(payload.action);
  const rawName = firstText(
    payload.tool_name, payload.toolName, payload.name, payload.tool, payload.tool_type,
    item.tool_name, item.toolName, item.name, nestedTool.name, nestedTool.type,
    nestedFunction.name, invocation.tool, invocation.name, action.type,
  ) || effectiveType.replaceAll("_", "-") || "unknown-tool";
  const callId = firstText(payload.call_id, payload.callId, item.call_id, item.callId, item.id, invocation.call_id, invocation.callId) || null;
  const semantics = toolSemantics(payload, item, invocation, rawName, effectiveType);
  const usage = extractToolUsage(payload);
  const isResult = ["result", "output", "end"].some((marker) => effectiveType.includes(marker));
  const status = firstText(payload.status, item.status) || (isResult ? "completed" : "observed");
  return {
    eventType: effectiveType,
    callId,
    rawName,
    category: toolCategory(rawName, effectiveType, semantics.semanticTool, semantics.provider),
    provider: semantics.provider,
    semanticTool: semantics.semanticTool,
    classificationSource: semantics.classificationSource,
    transportWrapper: semantics.transportWrapper,
    usage: usage.usage,
    usageReported: usage.present,
    usageKnown: usage.known,
    isResult,
    status,
  };
}

function makeTurn(index: number, turnId: string, timestamp: string, line: number, usage: Usage): MutableTurn {
  return {
    index, turnId, startedAt: timestamp, startedLine: line, startUsage: usage, endUsage: usage,
    status: "incomplete", endedAt: null, durationMs: null, timeToFirstTokenMs: null, abortReason: null,
    messages: [], outputs: [], models: [], efforts: [], contextWindows: [], tokenSnapshots: 0,
    modelResponses: 0, compactions: 0, warningCodes: [], dailyUsage: new Map(),
    dailyModelResponses: new Map(), dailyTokenSnapshots: new Map(), latestContextSnapshot: null,
    contextTimeline: [], contextCompactions: [], toolCalls: [], rangeUsage: zeroUsage(),
    rangeRelevant: true, rangeFirstActivityAt: timestamp || null, rangeLastActivityAt: timestamp || null,
    messageEvents: 0,
  };
}

function addDaily(map: Map<string, Usage>, day: string | null, usage: Usage): void {
  if (!day) return;
  map.set(day, addUsage(map.get(day) ?? zeroUsage(), usage));
}

function addCount(map: Map<string, number>, day: string | null, amount = 1): void {
  if (!day) return;
  map.set(day, (map.get(day) ?? 0) + amount);
}

function uniquePush(values: string[] | number[], value: string | number | null): void {
  if (value === null || value === "" || value === 0) return;
  if (!values.includes(value as never)) values.push(value as never);
}

function toolSummary(calls: ToolCall[]): TurnReport["toolSummary"] {
  const categories: Record<string, number> = {};
  let usage = zeroUsage();
  for (const call of calls) {
    categories[call.category] = (categories[call.category] ?? 0) + 1;
    if (call.usageReported) usage = addUsage(usage, call.usage);
  }
  return {
    callCount: calls.length,
    reportedCallCount: calls.filter((call) => call.usageReported).length,
    unknownCallCount: calls.filter((call) => !call.usageReported).length,
    usage,
    categories,
  };
}

function turnReport(turn: MutableTurn, cacheWriteAvailable: boolean): TurnReport {
  const usage = clampUsage(subtractUsage(turn.endUsage, turn.startUsage));
  const { breakdown, mismatch } = usageBreakdown(usage, cacheWriteAvailable);
  const snapshot = turn.latestContextSnapshot;
  const contextSnapshot: ContextSnapshot = snapshot ? {
    snapshotType: turn.status === "incomplete" ? "current_latest" : "turn_end",
    ...snapshotPayload(snapshot),
  } as ContextSnapshot : {
    snapshotType: "unknown", tokens: null, windowTokens: null, occupancyRate: null, timestamp: null,
  };
  const dailyUsage = [...turn.dailyUsage.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, daily]) => ({ date, usage: daily }));
  const contextTimeline = turn.contextTimeline.map((point) => ({
    tokens: point.tokens,
    windowTokens: point.windowTokens,
    occupancyRate: point.windowTokens ? Math.round((10000 * point.tokens) / point.windowTokens) / 100 : null,
    timestamp: point.timestamp,
    turnTokenOffset: point.turnTokenOffset,
  }));
  return {
    index: turn.index, turnId: turn.turnId, status: turn.status, startedAt: turn.startedAt, endedAt: turn.endedAt,
    durationMs: turn.durationMs, timeToFirstTokenMs: turn.timeToFirstTokenMs, abortReason: turn.abortReason,
    messages: turn.messages, outputs: turn.outputs, models: turn.models, efforts: turn.efforts,
    contextWindows: turn.contextWindows, tokenSnapshots: turn.tokenSnapshots, modelResponses: turn.modelResponses,
    compactions: turn.compactions, warnings: turn.warningCodes, usage, dailyUsage,
    dailyModelResponses: Object.fromEntries(turn.dailyModelResponses),
    dailyTokenSnapshots: Object.fromEntries(turn.dailyTokenSnapshots), breakdown, breakdownMismatch: mismatch,
    rangeClipped: false, rangeFirstActivityAt: turn.rangeFirstActivityAt, rangeLastActivityAt: turn.rangeLastActivityAt,
    contextSnapshot, contextTimeline, contextCompactions: turn.contextCompactions,
    toolCalls: turn.toolCalls, toolSummary: toolSummary(turn.toolCalls),
  };
}

function warning(severity: WarningRecord["severity"], code: string, message: string, line?: number, turnId?: string): WarningRecord {
  return { severity, code, message, ...(line === undefined ? {} : { line }), ...(turnId ? { turnId } : {}) };
}

function sourceKind(meta: JsonRecord): "main" | "subagent" | "automation" {
  const rendered = [meta.parent_thread_id, meta.source, meta.thread_source, meta.originator].map(text).join(" ").toLowerCase();
  return meta.parent_thread_id || rendered.includes("subagent") ? "subagent" : rendered.includes("automation") ? "automation" : "main";
}

export function parseRollout(filePath: string, options: { tolerateLive?: boolean } = {}): RolloutReport {
  const tolerateLive = options.tolerateLive ?? false;
  const absolutePath = path.resolve(filePath);
  const file = fs.readFileSync(absolutePath, "utf8");
  const lines = file.split(/\r?\n/);
  const warnings: WarningRecord[] = [];
  const turns: MutableTurn[] = [];
  const turnsById = new Map<string, MutableTurn>();
  const metaRecords: JsonRecord[] = [];
  const orphanMessages: TurnMessage[] = [];
  const toolCallsByKey = new Map<string, ToolCall>();
  let current: MutableTurn | null = null;
  let latestUsage = zeroUsage();
  let unattributedUsage = zeroUsage();
  let latestContext: RawContextSnapshot | null = null;
  let pendingCompaction: ContextCompaction | null = null;
  let malformedLines = 0;
  let blankLines = 0;
  let tokenEvents = 0;
  let duplicateSnapshots = 0;
  let rollbackCount = 0;
  let toolSequence = 0;
  let cacheWriteAvailable = false;
  let reasoningAvailable = false;
  let totalFieldAvailable = true;
  let counterResets = 0;
  let subagentPreamble = false;
  let subagentBaselineApplied = false;

  const noteActivity = (turn: MutableTurn | null, timestamp: string) => {
    if (turn) {
      turn.rangeRelevant = true;
      if (!turn.rangeFirstActivityAt) turn.rangeFirstActivityAt = timestamp || null;
      turn.rangeLastActivityAt = timestamp || turn.rangeLastActivityAt;
    }
  };

  const recordTool = (recordType: string, payload: JsonRecord, timestamp: string) => {
    const event = extractToolEvent(recordType, payload);
    if (!event || !current) return;
    const key = event.callId ? `${current.turnId}:${event.callId}` : "";
    const existing = key ? toolCallsByKey.get(key) : undefined;
    if (existing) {
      const values = { ...existing.usage };
      for (const known of event.usageKnown) values[known as keyof Usage] = event.usage[known as keyof Usage];
      const usageKnown = new Set([...existing.usageKnown, ...event.usageKnown]);
      if (usageKnown.has("input") && usageKnown.has("output") && !usageKnown.has("total")) {
        values.total = values.input + values.output;
        usageKnown.add("total");
      }
      existing.usage = values;
      existing.usageKnown = [...usageKnown].sort();
      existing.usageReported = usageKnown.size > 0;
      existing.endedAt = event.isResult ? timestamp : existing.endedAt;
      existing.status = event.status;
      existing.provider = event.provider ?? existing.provider;
      existing.semanticTool = event.semanticTool ?? existing.semanticTool;
      if (event.classificationSource !== "raw") existing.classificationSource = event.classificationSource;
      existing.category = toolCategory(existing.rawName, event.eventType, existing.semanticTool, existing.provider);
      return;
    }
    toolSequence += 1;
    const call: ToolCall = {
      sequence: toolSequence, callId: event.callId, name: event.rawName, rawName: event.rawName,
      category: event.category, provider: event.provider, semanticTool: event.semanticTool,
      classificationSource: event.classificationSource, transportWrapper: event.transportWrapper,
      timestamp, endedAt: event.isResult ? timestamp : null, status: event.status, usage: event.usage,
      usageReported: event.usageReported, usageKnown: [...event.usageKnown].sort(),
    };
    current.toolCalls.push(call);
    if (key) toolCallsByKey.set(key, call);
    noteActivity(current, timestamp);
  };

  const finishCurrent = () => {
    if (!current) return;
    current.status = "incomplete";
    current.endedAt = null;
    current.warningCodes.push("unclosed_turn");
    warnings.push(warning(tolerateLive ? "warning" : "error", "unclosed_turn", "rollout 结束时仍有一个活动轮次未闭合。", undefined, current.turnId));
    turns.push(current);
    current = null;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const lineNumber = index + 1;
    const stripped = rawLine.trim();
    if (!stripped) {
      blankLines += 1;
      continue;
    }
    let parsed: RolloutRecord;
    try {
      parsed = JSON.parse(stripped) as RolloutRecord;
    } catch {
      malformedLines += 1;
      const trailingPartial = index === lines.length - 1 && !file.endsWith("\n") && !file.endsWith("\r");
      warnings.push(warning(trailingPartial && tolerateLive ? "warning" : "error", trailingPartial ? "trailing_partial_line" : "malformed_json", trailingPartial ? "已忽略末尾疑似未写完的 JSON 行。" : "已忽略格式错误的 JSON。", lineNumber));
      continue;
    }
    const recordType = text(parsed.type);
    const payload = record(parsed.payload);
    const timestamp = text(parsed.timestamp);
    const eventType = text(payload.type);

    if (recordType === "session_meta") {
      metaRecords.push(payload);
      const renderedSource = [payload.source, payload.thread_source, payload.originator].map(text).join(" ").toLowerCase();
      if (payload.parent_thread_id || renderedSource.includes("subagent")) subagentPreamble = true;
      continue;
    }
    if (recordType === "turn_context") {
      const target = turnsById.get(text(payload.turn_id)) ?? current;
      if (target) {
        uniquePush(target.models, firstText(payload.model, payload.model_name));
        const mode = record(payload.collaboration_mode);
        uniquePush(target.efforts, firstText(payload.effort, record(mode.settings).reasoning_effort));
        uniquePush(target.contextWindows, nonNegative(payload.model_context_window));
      }
      continue;
    }
    if (recordType === "compacted") {
      if (current) pendingCompaction = { timestamp, before: snapshotPayload(latestContext), after: null, turnTokenOffset: clampUsage(subtractUsage(current.endUsage, current.startUsage)).total };
      continue;
    }

    if (recordType === "response_item") {
      if (current && text(payload.role) === "assistant") {
        const output = responseText(payload);
        if (output && current.outputs.at(-1)?.text !== output) current.outputs.push({ timestamp, text: output, phase: firstText(payload.phase) || null });
      }
      recordTool(recordType, payload, timestamp);
      continue;
    }
    if (recordType !== "event_msg") {
      if (["tool_call", "tool_result", "tool_output"].includes(recordType)) recordTool(recordType, payload, timestamp);
      continue;
    }
    if (extractToolEvent(eventType || recordType, payload)) {
      recordTool(eventType || recordType, payload, timestamp);
      continue;
    }

    if (eventType === "thread_settings_applied" && subagentPreamble && !subagentBaselineApplied && current) {
      current = null;
      turns.length = 0;
      turnsById.clear();
      orphanMessages.length = 0;
      warnings.length = 0;
      toolCallsByKey.clear();
      unattributedUsage = zeroUsage();
      latestContext = null;
      pendingCompaction = null;
      malformedLines = 0;
      blankLines = 0;
      tokenEvents = 0;
      duplicateSnapshots = 0;
      rollbackCount = 0;
      counterResets = 0;
      subagentBaselineApplied = true;
      continue;
    }

    if (eventType === "task_started") {
      if (current) {
        current.warningCodes.push("nested_task_start");
        warnings.push(warning("error", "nested_task_start", "当前轮次尚未结束，又出现了新的 task_started 事件。", lineNumber, current.turnId));
        turns.push(current);
      }
      const turnId = firstText(payload.turn_id) || `unknown-${turns.length + 1}`;
      current = makeTurn(turns.length + 1, turnId, timestamp, lineNumber, latestUsage);
      uniquePush(current.contextWindows, nonNegative(payload.model_context_window));
      turnsById.set(turnId, current);
      continue;
    }
    if (eventType === "user_message") {
      const images = payload.images;
      const localImages = payload.local_images;
      const audio = payload.audio;
      const localAudio = payload.local_audio;
      const message: TurnMessage = {
        timestamp,
        text: firstText(payload.message, payload.text),
        clientId: firstText(payload.client_id) || null,
        imageCount: (Array.isArray(images) ? images.length : 0) + (Array.isArray(localImages) ? localImages.length : 0),
        audioCount: (Array.isArray(audio) ? audio.length : 0) + (Array.isArray(localAudio) ? localAudio.length : 0),
      };
      if (current) {
        current.messageEvents += 1;
        message.steering = current.messageEvents > 1;
        current.messages.push(message);
        noteActivity(current, timestamp);
      } else {
        orphanMessages.push(message);
        warnings.push(warning("warning", "orphan_user_message", "活动轮次之外出现了一条用户消息。", lineNumber));
      }
      continue;
    }
    if (eventType === "agent_message") {
      if (current) {
        const output = firstText(payload.message, payload.text);
        if (output && current.outputs.at(-1)?.text !== output) current.outputs.push({ timestamp, text: output, phase: firstText(payload.phase) || null });
        noteActivity(current, timestamp);
      }
      continue;
    }
    if (eventType === "token_count") {
      const info = record(payload.info);
      const totalPayload = record(info.total_token_usage);
      const extracted = usageFromPayload(totalPayload);
      if (!extracted.present) {
        warnings.push(warning("error", "missing_total_usage", "token_count 不包含 total_token_usage。", lineNumber, current?.turnId));
        continue;
      }
      cacheWriteAvailable ||= "cache_write_input_tokens" in totalPayload;
      reasoningAvailable ||= "reasoning_output_tokens" in totalPayload;
      totalFieldAvailable &&= "total_tokens" in totalPayload;
      const rawUsage = extracted.usage;
      let delta = subtractUsage(rawUsage, latestUsage);
      if (rawUsage.total < latestUsage.total) {
        counterResets += 1;
        warnings.push(warning("error", "counter_reset", "累计 Token 计数器发生回退，已从新基线继续计算。", lineNumber, current?.turnId));
        delta = rawUsage;
      }
      delta = clampUsage(delta);
      const lastUsage = usageFromPayload(info.last_token_usage);
      if (delta.total === 0) duplicateSnapshots += 1;
      tokenEvents += 1;
      latestUsage = rawUsage;
      if (lastUsage.present && lastUsage.known.has("total")) {
        const contextWindow = nonNegative(info.model_context_window) || current?.contextWindows.at(-1) || null;
        latestContext = { tokens: lastUsage.usage.total, windowTokens: contextWindow || null, timestamp };
        if (current) {
          current.latestContextSnapshot = latestContext;
          current.contextTimeline.push({ ...latestContext, turnTokenOffset: clampUsage(subtractUsage(rawUsage, current.startUsage)).total });
        }
        if (pendingCompaction && !pendingCompaction.after) pendingCompaction.after = snapshotPayload(latestContext);
      }
      if (current) {
        current.endUsage = rawUsage;
        current.tokenSnapshots += 1;
        if (delta.total > 0) current.modelResponses += 1;
        current.rangeUsage = addUsage(current.rangeUsage, delta);
        addDaily(current.dailyUsage, localDay(timestamp), delta);
        addCount(current.dailyTokenSnapshots, localDay(timestamp));
        if (delta.total > 0) addCount(current.dailyModelResponses, localDay(timestamp));
        if (nonNegative(info.model_context_window)) uniquePush(current.contextWindows, nonNegative(info.model_context_window));
        noteActivity(current, timestamp);
      } else if (delta.total > 0) {
        unattributedUsage = addUsage(unattributedUsage, delta);
        warnings.push(warning("warning", "unattributed_usage", `活动轮次之外增加了 ${delta.total.toLocaleString()} 个 Token。`, lineNumber));
      }
      continue;
    }
    if (eventType === "task_complete" || eventType === "turn_aborted") {
      if (!current) {
        warnings.push(warning("error", "orphan_task_terminal", `没有活动轮次时出现了 ${eventType}。`, lineNumber));
        continue;
      }
      const terminalId = firstText(payload.turn_id);
      if (terminalId && terminalId !== current.turnId) {
        current.warningCodes.push("turn_id_mismatch");
        warnings.push(warning("error", "turn_id_mismatch", `结束事件的轮次 ID ${terminalId} 与活动轮次 ${current.turnId} 不一致。`, lineNumber, current.turnId));
      }
      current.status = eventType === "task_complete" ? "complete" : "aborted";
      current.endedAt = timestamp || null;
      current.durationMs = payload.duration_ms === undefined ? null : nonNegative(payload.duration_ms);
      current.timeToFirstTokenMs = payload.time_to_first_token_ms === undefined ? null : nonNegative(payload.time_to_first_token_ms);
      current.abortReason = eventType === "turn_aborted" ? firstText(payload.reason) || null : null;
      noteActivity(current, timestamp);
      turns.push(current);
      current = null;
      pendingCompaction = null;
      continue;
    }
    if (eventType === "context_compacted") {
      if (current) {
        current.compactions += 1;
        current.contextCompactions.push(pendingCompaction ?? { timestamp, before: snapshotPayload(latestContext), after: snapshotPayload(latestContext), turnTokenOffset: clampUsage(subtractUsage(current.endUsage, current.startUsage)).total });
        pendingCompaction = null;
        noteActivity(current, timestamp);
      }
      continue;
    }
    if (eventType === "thread_rolled_back") rollbackCount += 1;
  }
  finishCurrent();

  const selectedMeta = metaRecords[0] ?? {};
  const threadId = firstText(selectedMeta.id, selectedMeta.session_id) || path.basename(absolutePath).match(/[0-9a-f]{8}-[0-9a-f-]{27}/i)?.[0] || path.basename(absolutePath, path.extname(absolutePath));
  const turnReports = turns.map((turn, index) => { turn.index = index + 1; return turnReport(turn, cacheWriteAvailable); });
  let turnUsageSum = zeroUsage();
  let toolUsage = zeroUsage();
  const toolCategories: Record<string, number> = {};
  let toolCallCount = 0;
  let toolReportedCallCount = 0;
  for (const turn of turnReports) {
    turnUsageSum = addUsage(turnUsageSum, turn.usage);
    toolUsage = addUsage(toolUsage, turn.toolSummary.usage);
    toolCallCount += turn.toolSummary.callCount;
    toolReportedCallCount += turn.toolSummary.reportedCallCount;
    for (const [category, count] of Object.entries(turn.toolSummary.categories)) toolCategories[category] = (toolCategories[category] ?? 0) + count;
  }
  const finalUsage = latestUsage;
  const accountedUsage = addUsage(turnUsageSum, unattributedUsage);
  const reconciliationDifference = subtractUsage(finalUsage, accountedUsage);
  if (Object.values(reconciliationDifference).some((value) => value !== 0)) warnings.push(warning("error", "reconciliation_mismatch", "逐轮用量加未归属用量与最终累计计数不一致。"));
  if (!totalFieldAvailable) warnings.push(warning("warning", "derived_total_tokens", "至少一个快照缺少 total_tokens；已改用输入加输出计算。"));
  if (!cacheWriteAvailable) warnings.push(warning("info", "cache_write_unavailable", "该 rollout 格式不提供 cache_write_input_tokens。"));
  const finalBreakdown = usageBreakdown(finalUsage, cacheWriteAvailable);
  const daily = new Map<string, Usage>();
  for (const turn of turnReports) for (const entry of turn.dailyUsage) addDaily(daily, entry.date, entry.usage);
  const statusCounts: Record<string, number> = { complete: 0, aborted: 0, incomplete: 0 };
  for (const turn of turnReports) statusCounts[turn.status] = (statusCounts[turn.status] ?? 0) + 1;
  const stat = fs.statSync(absolutePath);
  const errorCount = warnings.filter((item) => item.severity === "error").length;
  return {
    schemaVersion: 1,
    generator: { name: "codex-token-desk", version: PARSER_VERSION },
    metadata: {
      threadId, sourcePath: absolutePath, sourceName: path.basename(absolutePath), sourceBytes: stat.size,
      sourceModifiedAt: new Date(stat.mtimeMs).toISOString(), generatedAt: new Date().toISOString(),
      sessionMeta: {
        id: firstText(selectedMeta.id) || null, sessionId: firstText(selectedMeta.session_id) || null,
        cwd: firstText(selectedMeta.cwd) || null, originator: firstText(selectedMeta.originator) || null,
        cliVersion: firstText(selectedMeta.cli_version) || null, forkedFromId: firstText(selectedMeta.forked_from_id) || null,
        parentThreadId: firstText(selectedMeta.parent_thread_id) || null, source: firstText(selectedMeta.source) || null,
        threadSource: firstText(selectedMeta.thread_source) || null,
      },
      sourceKind: sourceKind(selectedMeta), dateWindow: null, hasRangeActivity: true,
      rangeFirstActivityAt: turnReports[0]?.startedAt ?? null, rangeLastActivityAt: turnReports.at(-1)?.endedAt ?? turnReports.at(-1)?.startedAt ?? null,
      subagentBaselineApplied, containsFullUserMessages: true, cacheWriteFieldAvailable: cacheWriteAvailable,
      reasoningFieldAvailable: reasoningAvailable, hasToolEvents: toolCallCount > 0,
    },
    summary: {
      turnCount: turnReports.length, statusCounts, zeroUsageTurns: turnReports.filter((turn) => turn.usage.total === 0).length,
      tokenEvents, duplicateSnapshots, rollbacks: rollbackCount, contextCompactions: turnReports.reduce((sum, turn) => sum + turn.compactions, 0),
      malformedLines, blankLines, orphanMessageCount: orphanMessages.length, counterResets, finalUsage,
      finalBreakdown: finalBreakdown.breakdown, finalBreakdownMismatch: finalBreakdown.mismatch, turnUsageSum,
      unattributedUsage, accountedUsage, reconciliationDifference, integrityErrorCount: errorCount, warningCount: warnings.length,
      dailyUsage: [...daily.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([date, usage]) => ({ date, usage })),
      toolCallCount, toolReportedCallCount, toolUnknownCallCount: toolCallCount - toolReportedCallCount, toolUsage, toolCategories,
    },
    warnings, orphanMessages, turns: turnReports,
  };
}

export function sessionTitle(session: RolloutReport): string {
  const message = session.turns.flatMap((turn) => turn.messages).find((item) => item.text.trim())?.text.trim();
  if (message) return message.length > 72 ? `${message.slice(0, 69)}…` : message;
  return `未命名会话 · ${session.metadata.threadId.slice(0, 8)}`;
}
