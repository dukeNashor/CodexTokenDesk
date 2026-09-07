import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TokenContextTracks } from "./token-context-tracks";
import type { AggregatedTurnReport, ToolCall } from "@/lib/types";

function turn(overrides: Partial<AggregatedTurnReport> = {}): AggregatedTurnReport {
  return {
    turnId: "round", index: 1, sourceRolloutId: "main", sourceKind: "main", sourceLabel: "主代理",
    status: "complete", usage: { total: 0 }, contextTimeline: [], contextCompactions: [],
    contextSnapshot: { occupancyRate: null }, toolCalls: [], compactions: 0,
    ...overrides,
  } as AggregatedTurnReport;
}
const render = (turns: AggregatedTurnReport[], categories = new Set<string>()) => renderToStaticMarkup(
  <TokenContextTracks turns={turns} selectedToolCategories={categories} unit="M" onSelectTurn={() => {}} onSelectTool={() => {}} />,
);

describe("instrument tracks", () => {
  it("keeps zero-token rounds selectable and unknown Context distinct from zero occupancy", () => {
    const unknown = render([turn()]);
    const zero = render([turn({ contextSnapshot: { occupancyRate: 0 } as AggregatedTurnReport["contextSnapshot"] })]);
    expect(unknown).toContain('aria-label="第 1 轮，主代理，0M Token，Context 未知');
    expect(unknown).toContain('<title>Context 未知</title>');
    expect(zero).not.toContain('<title>Context 未知</title>');
    expect(zero).toContain('Context 0.0%');
    expect(unknown).not.toMatch(/NaN|Infinity/);
  });

  it("retains source identity and both sides of a compaction without inventing a known value", () => {
    const markup = render([turn({ sourceKind: "subagent", sourceRolloutId: "child", sourceLabel: "检查代理", parentThreadId: "parent-123", contextCompactions: [{ timestamp: "2026-09-07T00:00:00Z", turnTokenOffset: 0, before: { occupancyRate: 95 } as never, after: null }] })]);
    expect(markup).toContain('检查代理');
    expect(markup).toContain('父任务 parent-123');
    expect(markup).toContain('压缩 · 95.0% → 未知');
    expect(markup).not.toMatch(/NaN|Infinity/);
  });

  it("groups tools by category while retaining counts and the unknown-token signal", () => {
    const calls = [false, true].map((usageReported, sequence) => ({ sequence, name: "lookup", category: "web-search", usageReported, usage: { total: 0 } }) as ToolCall);
    const visible = render([turn({ toolCalls: calls })], new Set(["web-search"]));
    expect(visible).toContain('第 1 轮 Web Search 2 次，含 Token 未知');
    expect(render([turn({ toolCalls: calls })])).not.toContain('Web Search 2 次');
  });

  it("shows an empty state and defaults to all rounds for long sessions", () => {
    expect(render([])).toContain('当前筛选没有轮次');
    const markup = render(Array.from({ length: 20 }, (_, index) => turn({ index: index + 1, turnId: `turn-${index}` })));
    expect(markup).toContain('轮次 1–20');
    expect(markup).toContain('aria-label="下一组轮次"');
    expect(markup).toContain('aria-label="第 20 轮');
  });

  it("identifies an interleaved source on its curve hit layer without a separate source row", () => {
    const markup = render([
      turn({ sourceRolloutId: "child", sourceKind: "subagent", sourceLabel: "检查代理", contextSnapshot: { occupancyRate: 20 } as never }),
      turn({ turnId: "main-2", index: 2, contextSnapshot: { occupancyRate: 60 } as never }),
      turn({ turnId: "child-3", index: 3, sourceRolloutId: "child", sourceKind: "subagent", sourceLabel: "检查代理", contextSnapshot: { occupancyRate: 30 } as never }),
    ]);
    expect(markup).toContain('data-source="child" data-source-label="检查代理"');
    expect(markup).not.toContain('class="track-source-label"');
    expect(markup.indexOf('class="track-curve-targets"')).toBeGreaterThan(markup.lastIndexOf('class="track-column"'));
    expect(markup).toContain('第 3 轮，检查代理');
  });
});

it("labels a selected filtered round using its hidden predecessor in percentage points", () => {
  const before = turn({ turnId: "before", contextSnapshot: { tokens: 1000, occupancyRate: 10 } as never });
  const hidden = turn({ turnId: "hidden", contextSnapshot: { tokens: 2200, occupancyRate: 20 } as never });
  const selected = turn({ turnId: "selected", index: 3, contextSnapshot: { tokens: 14600, occupancyRate: 90 } as never });
  const markup = renderToStaticMarkup(<TokenContextTracks turns={[selected]} contextTurns={[before, hidden, selected]} selectedTurnId="main:selected" selectedToolCategories={new Set()} unit="M" onSelectTurn={() => {}} onSelectTool={() => {}} />);
  expect(markup).toContain("90.0%</text>");
  expect(markup).toContain("+70.0%</text>");
  expect(markup).toContain("Context 净变化 +70 个百分点");
  expect(markup).not.toContain("+80.0%</text>");
});

it("omits the visible connector and its hit target across a child round", () => {
  const markup = render([
    turn({ turnId: "main-6", index: 6, contextSnapshot: { occupancyRate: 34.02 } as never }),
    turn({ turnId: "child-7", index: 7, sourceRolloutId: "child", sourceKind: "subagent", contextSnapshot: { occupancyRate: 18.92 } as never }),
    turn({ turnId: "main-8", index: 8, contextSnapshot: { occupancyRate: 34.58 } as never }),
  ]);
  expect(markup).not.toContain('data-curve="connection-');
  expect(markup).not.toContain('class="track-context track-connection"');
});
