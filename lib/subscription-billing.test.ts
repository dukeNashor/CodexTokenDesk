import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRollout } from "@/lib/rollout-parser";
import { aggregateSubscriptionUsage } from "@/lib/subscription-billing";

type Event = { type: string; payload: object };
const start: Event = { type: "event_msg", payload: { type: "task_started", turn_id: "t" } };
const end: Event = { type: "event_msg", payload: { type: "task_complete", turn_id: "t" } };
const context = (model: string, tier?: string): Event => ({ type: "turn_context", payload: { turn_id: "t", model, ...(tier ? { service_tier: tier } : {}) } });
const usage = (input: number, cached = 0, output = 0, reasoning = 0, cacheWrite = 0) => ({ input_tokens: input, cached_input_tokens: cached, output_tokens: output, reasoning_output_tokens: reasoning, cache_write_input_tokens: cacheWrite, total_tokens: input + output });
const token = (total: ReturnType<typeof usage>, last: ReturnType<typeof usage> | null = total): Event => ({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: total, last_token_usage: last, model_context_window: 1_050_000 } } });

function parse(events: Event[]) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "token-desk-billing-"));
  const file = path.join(directory, "synthetic.jsonl");
  try {
    fs.writeFileSync(file, [start, ...events, end].map((event, i) => JSON.stringify({ timestamp: `2026-09-07T00:00:${String(i).padStart(2, "0")}Z`, ...event })).join("\n"));
    return parseRollout(file);
  } finally {
    fs.unlinkSync(file);
    fs.rmdirSync(directory);
  }
}

describe("subscription credits from rollout requests", () => {
  it("prices cached input and output independently, without adding reasoning twice", () => {
    const result = aggregateSubscriptionUsage(parse([context("gpt-6-astra", "standard"), token(usage(100_000, 80_000, 10_000, 9_000))]).turns);
    expect(result.estimatedCredits).toBeCloseTo(19.5);
    expect(result.models[0]).toMatchObject({ issues: [], peakInputTokens: 100_000 });
  });

  it.each([
    ["gpt-6-astra", "fast", 6.25],
    ["gpt-5.6-sol", "priority", 2.5],
    ["gpt-5.6-terra", "fast", 1.25],
    ["gpt-5.6-luna", "fast", 0.125],
    ["gpt-5.5", "fast", 3.125],
    ["gpt-5.4", "fast", 1.25],
  ])("applies subscription Fast for %s (%s)", (model, tier, expected) => {
    const result = aggregateSubscriptionUsage(parse([context(model, tier), token(usage(10_000))]).turns);
    expect(result.estimatedCredits).toBeCloseTo(expected);
    expect(result.models[0].fastRequests).toBe(1);
  });

  it.each([undefined, "batch", "flex", "auto"])("marks %s mode and uses Standard without API discounts", (tier) => {
    const result = aggregateSubscriptionUsage(parse([context("gpt-5.6-sol", tier), token(usage(10_000))]).turns);
    expect(result.estimatedCredits).toBe(1);
    expect(result.models[0].issues).toContain(tier ? "mode_unsupported" : "mode_missing");
  });

  it("keeps the model and tier at each request, skips duplicate snapshots, and resets missing tier", () => {
    const first = usage(10_000);
    const result = aggregateSubscriptionUsage(parse([
      context("gpt-6-astra", "fast"), token(first), token(first),
      context("gpt-5.6-luna"), token(usage(20_000), first),
    ]).turns);
    expect(result.estimatedCredits).toBeCloseTo(6.3);
    expect(result.models.map((model) => model.rawTokens)).toEqual([10_000, 10_000]);
    expect(result.models[1].issues).toContain("mode_missing");
  });

  it("detects actual input above 272K, including cache, not output, window size or turn sum", () => {
    const events = [
      context("gpt-6-astra", "standard"),
      token(usage(272_000, 270_000, 20_000)),
      token(usage(544_001, 540_001, 40_000), usage(272_001, 270_001, 20_000)),
    ];
    const result = aggregateSubscriptionUsage(parse(events).turns);
    expect(result.models[0]).toMatchObject({ longContextRequests: 1, peakInputTokens: 272_001 });
    expect(result.models[0].issues).toContain("long_context_unconfirmed");
    // No undocumented API long-context multiplier is applied to subscription credits.
    expect(result.estimatedCredits).toBeCloseTo(64.500025);
  });

  it("marks missing or inconsistent per-request usage and does not infer context from cumulative deltas", () => {
    const report = parse([context("gpt-6-astra", "fast"), token(usage(600_000), usage(200_000))]);
    expect(report.turns[0].requestUsage?.[0]).toMatchObject({ inputTokens: null, usageComplete: false });
    const result = aggregateSubscriptionUsage(report.turns);
    expect(result.estimatedCredits).toBe(150);
    expect(result.models[0]).toMatchObject({ peakInputTokens: null, longContextRequests: 0, fastRequests: 0 });
    expect(result.models[0].issues).toContain("request_usage_missing");
  });

  it("keeps cumulative reconciliation behavior when the counter resets", () => {
    const report = parse([context("gpt-5.6-sol", "standard"), token(usage(1000)), token(usage(200))]);
    expect(report.warnings.map((warning) => warning.code)).toContain("counter_reset");
    const result = aggregateSubscriptionUsage(report.turns);
    expect(result.models[0].rawTokens).toBe(report.turns[0].usage.total);
    expect(result.estimatedCredits).toBeCloseTo(0.02);
    expect(result.models[0].issues).toContain("request_usage_missing");
  });

  it("supports historical logs without last usage using an explicit Standard fallback", () => {
    const result = aggregateSubscriptionUsage(parse([context("gpt-5.6-sol"), token(usage(1000), null)]).turns);
    expect(result.estimatedCredits).toBeCloseTo(0.1);
    expect(result.models[0].issues).toEqual(expect.arrayContaining(["mode_missing", "request_usage_missing"]));
  });

  it("does not invent a Spark rate, and marks unknown model fallback", () => {
    const result = aggregateSubscriptionUsage(parse([
      context("gpt-5.3-codex-spark", "standard"), token(usage(1000)),
      context("unknown-model", "fast"), token(usage(2000), usage(1000)),
    ]).turns);
    expect(result.unpricedTokens).toBe(1000);
    expect(result.estimatedCredits).toBeCloseTo(0.1);
    expect(result.models.find((model) => model.model.includes("spark"))?.estimatedCredits).toBeNull();
    expect(result.models.find((model) => model.model === "unknown-model")?.issues).toContain("model_unknown");
  });

  it("uses the independently published mini output credit rate", () => {
    const result = aggregateSubscriptionUsage(parse([context("gpt-5.4-mini", "fast"), token(usage(0, 0, 10_000))]).turns);
    expect(result.estimatedCredits).toBeCloseTo(1.13);
    expect(result.models[0].issues).toContain("fast_rate_unknown");
  });

  it("includes cache writes in input rather than adding an API write surcharge", () => {
    const result = aggregateSubscriptionUsage(parse([context("gpt-6-astra", "standard"), token(usage(1000, 0, 0, 0, 1000))]).turns);
    expect(result.estimatedCredits).toBeCloseTo(0.25);
    expect(result.models[0].issues).toContain("cache_write_rate");
  });

  it("leaves an empty selection at zero without missing-data warnings", () => {
    expect(aggregateSubscriptionUsage([])).toEqual({ estimatedCredits: 0, unpricedTokens: 0, models: [] });
  });
});
