import { describe, expect, it } from "vitest";
import { contextConnections, trackBands, contextDeltas } from "./context-track";
import type { AggregatedTurnReport } from "./types";

function round(source: string, rate: number | null, extra: Partial<AggregatedTurnReport> = {}): AggregatedTurnReport {
  return { sourceRolloutId: source, usage: { total: 10 }, contextSnapshot: { occupancyRate: rate }, contextTimeline: [], contextCompactions: [], ...extra } as AggregatedTurnReport;
}

describe("Context source continuity", () => {
  it("leaves gaps for both sources when their rounds are interleaved", () => {
    expect(contextConnections([round("main", 60), round("child", 10), round("main", 70), round("child", 20)]))
      .toEqual([]);
  });
  it("breaks at unknown values but connects real zero occupancy", () => {
    expect(contextConnections([round("main", 60), round("main", null), round("main", 0), round("main", 10)]))
      .toEqual([{ from: 2, to: 3, before: 0, after: 10 }]);
  });
  it("does not paint a normal connector across a boundary compaction", () => {
    expect(contextConnections([round("main", 90), round("main", 20, { contextCompactions: [{ turnTokenOffset: 0, before: null, after: null }] as never })])).toEqual([]);
  });
  it("retains an end-of-round sample and gives zero-token rounds a full slot", () => {
    const sampled = round("main", 30, { contextTimeline: [{ turnTokenOffset: 0, occupancyRate: 30 }, { turnTokenOffset: 10, occupancyRate: 70 }] as never });
    expect(contextConnections([sampled, round("main", 80)])[0].before).toBe(70);
    expect(trackBands(round("main", 0, { usage: { total: 0 } as never }))).toEqual([{ start: 0, end: 1, occupancyRate: 0 }]);
  });
});

const sample = (source: string, turnId: string, rate: number | null) => round(source, rate, { turnId, contextSnapshot: { tokens: 1000, occupancyRate: rate } as never });
describe("Context net change", () => {
  it("compares adjacent snapshots of each source, including zero and negative values", () => {
    const turns = [sample("main", "1", 10), sample("child", "1", 50), sample("main", "2", 10), sample("child", "2", 0), sample("main", "3", 25)];
    expect([...contextDeltas(turns).values()]).toEqual([10, 50, 0, -50, 15]);
  });
  it("does not treat an unknown snapshot as a zero baseline", () => {
    expect([...contextDeltas([sample("main", "1", null), sample("main", "2", 0), sample("main", "3", null), sample("main", "4", 30)]).values()]).toEqual([null, null, null, null]);
  });
  it("keeps net change through compression, rather than summing positive growth", () => {
    const compressed = sample("main", "2", 20);
    compressed.contextCompactions = [{ before: { tokens: 900 }, after: { tokens: 100 } }] as never;
    expect(contextDeltas([sample("main", "1", 80), compressed]).get("main:2")).toBe(-60);
  });
});

it("uses the full-history baseline even when earlier rounds are outside the date range", () => {
  const current = sample("main", "later", 40);
  expect(contextDeltas([{ ...current, contextBaselineRate: 30 }]).get("main:later")).toBe(10);
  expect(contextDeltas([{ ...current, contextBaselineRate: null }]).get("main:later")).toBeNull();
});
