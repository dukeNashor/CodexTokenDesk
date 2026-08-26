import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseRollout } from "@/lib/rollout-parser";

const fixture = path.join(process.cwd(), "tests", "fixtures", "synthetic-rollout.jsonl");

describe("TypeScript rollout parser", () => {
  it("reconciles cumulative usage into task turns", () => {
    const report = parseRollout(fixture);
    expect(report.metadata.threadId).toBe("00000000-0000-0000-0000-000000000001");
    expect(report.summary.turnCount).toBe(2);
    expect(report.summary.statusCounts).toEqual({ complete: 1, aborted: 1, incomplete: 0 });
    expect(report.summary.finalUsage.total).toBe(205);
    expect(report.turns.map((turn) => turn.usage.total)).toEqual([120, 85]);
    expect(report.summary.reconciliationDifference.total).toBe(0);
  });

  it("treats an unclosed live turn as non-fatal when requested", () => {
    const file = path.join(process.cwd(), "tests", "fixtures", "live-tail.jsonl");
    fs.writeFileSync(file, [
      JSON.stringify({ timestamp: "2026-01-01T00:00:00Z", type: "session_meta", payload: { id: "live", cwd: process.cwd() } }),
      JSON.stringify({ timestamp: "2026-01-01T00:00:01Z", type: "event_msg", payload: { type: "task_started", turn_id: "t" } }),
      JSON.stringify({ timestamp: "2026-01-01T00:00:02Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 5, output_tokens: 2, total_tokens: 7 } } } }),
    ].join("\n"));
    try {
      const report = parseRollout(file, { tolerateLive: true });
      expect(report.turns[0].status).toBe("incomplete");
      expect(report.warnings.some((item) => item.code === "unclosed_turn" && item.severity === "warning")).toBe(true);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it("merges tool result usage into the originating call", () => {
    const file = path.join(process.cwd(), "tests", "fixtures", "tool-rollout.jsonl");
    fs.writeFileSync(file, [
      { timestamp: "2026-01-01T00:00:00Z", type: "session_meta", payload: { id: "tool", cwd: process.cwd() } },
      { timestamp: "2026-01-01T00:00:01Z", type: "event_msg", payload: { type: "task_started", turn_id: "t" } },
      { timestamp: "2026-01-01T00:00:02Z", type: "event_msg", payload: { type: "tool_call", name: "computer", call_id: "c1" } },
      { timestamp: "2026-01-01T00:00:03Z", type: "event_msg", payload: { type: "tool_result", name: "computer", call_id: "c1", usage: { input_tokens: 3, output_tokens: 5, total_tokens: 8 } } },
      { timestamp: "2026-01-01T00:00:04Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } } } },
      { timestamp: "2026-01-01T00:00:05Z", type: "event_msg", payload: { type: "task_complete", turn_id: "t" } },
    ].map((line) => JSON.stringify(line)).join("\n"));
    try {
      const call = parseRollout(file).turns[0].toolCalls[0];
      expect(call.category).toBe("computer-use");
      expect(call.usage.total).toBe(8);
      expect(call.status).toBe("completed");
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it("classifies Sky calls through node_repl as computer use", () => {
    const file = path.join(process.cwd(), "tests", "fixtures", "sky-tool-rollout.jsonl");
    fs.writeFileSync(file, [
      { timestamp: "2026-01-01T00:00:00Z", type: "session_meta", payload: { id: "sky-tool", cwd: process.cwd() } },
      { timestamp: "2026-01-01T00:00:01Z", type: "event_msg", payload: { type: "task_started", turn_id: "t" } },
      { timestamp: "2026-01-01T00:00:02Z", type: "event_msg", payload: { type: "mcp_tool_call", name: "js", provider: "node_repl", semantic_tool: "js", invocation: { arguments: { code: "await sky.click({ x: 10, y: 20 })" } }, call_id: "c1" } },
      { timestamp: "2026-01-01T00:00:03Z", type: "event_msg", payload: { type: "task_complete", turn_id: "t" } },
    ].map((line) => JSON.stringify(line)).join("\n"));
    try {
      const call = parseRollout(file).turns[0].toolCalls[0];
      expect(call.category).toBe("computer-use");
      expect(call.provider).toBe("sky");
      expect(call.semanticTool).toBe("computer-use");
      expect(call.classificationSource).toBe("inferred");
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  it("drops the inherited parent preamble from subagent usage", () => {
    const file = path.join(process.cwd(), "tests", "fixtures", "subagent-rollout.jsonl");
    fs.writeFileSync(file, [
      { timestamp: "2026-01-01T00:00:00Z", type: "session_meta", payload: { id: "subagent", cwd: process.cwd(), source: "subagent", parent_thread_id: "parent" } },
      { timestamp: "2026-01-01T00:00:01Z", type: "event_msg", payload: { type: "task_started", turn_id: "inherited" } },
      { timestamp: "2026-01-01T00:00:02Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 } } } },
      { timestamp: "2026-01-01T00:00:03Z", type: "event_msg", payload: { type: "thread_settings_applied" } },
      { timestamp: "2026-01-01T00:00:04Z", type: "event_msg", payload: { type: "task_started", turn_id: "own-work" } },
      { timestamp: "2026-01-01T00:00:05Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 130, output_tokens: 30, total_tokens: 160 } } } },
      { timestamp: "2026-01-01T00:00:06Z", type: "event_msg", payload: { type: "task_complete", turn_id: "own-work" } },
    ].map((line) => JSON.stringify(line)).join("\n"));
    try {
      const report = parseRollout(file);
      expect(report.metadata.subagentBaselineApplied).toBe(true);
      expect(report.turns.map((turn) => turn.turnId)).toEqual(["own-work"]);
      expect(report.summary.turnUsageSum.total).toBe(40);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
});
