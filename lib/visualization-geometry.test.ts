import { describe, expect, it } from "vitest";

import { arcBandPath, contextBands, donutSegments, radialEntries } from "@/lib/visualization-geometry";
import type { AggregatedTurnReport } from "@/lib/types";

const makeTurn = (id: string, total: number, kind: "main" | "subagent" = "main") => ({
  turnId: id,
  usage: { total },
  sourceKind: kind,
  sourceRolloutId: kind === "main" ? "root" : "child",
  contextTimeline: [],
  contextSnapshot: { occupancyRate: 25 },
}) as unknown as AggregatedTurnReport;

describe("visualization geometry", () => {
  it("maps token progress and connects subagents to the preceding main turn", () => {
    const main = makeTurn("main", 60);
    const subagent = makeTurn("sub", 40, "subagent");
    const entries = radialEntries([main, subagent]);
    expect(entries[0]).toMatchObject({ start: 0, end: 0.6, satellite: false });
    expect(entries[1]).toMatchObject({ start: 0.6, end: 1, satellite: true, parent: main });
  });

  it("creates a closed arc band and context fallback band", () => {
    expect(arcBandPath(100, 100, 20, 30, 0, 0.5)).toMatch(/^M.+Z$/);
    expect(contextBands(makeTurn("main", 10))).toEqual([{ start: 0, end: 10, occupancyRate: 25 }]);
  });

  it("normalizes donut values", () => {
    expect(donutSegments([2, 3], (value) => value)).toEqual([
      { item: 2, start: 0, end: 0.4, value: 2 },
      { item: 3, start: 0.4, end: 1, value: 3 },
    ]);
  });
});
