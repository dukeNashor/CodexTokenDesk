import { describe, expect, it } from "vitest";
import { adjacentTurn } from "./turn-navigation";
import type { AggregatedTurnReport } from "./types";
const turn = (sourceRolloutId: string, turnId: string) => ({ sourceRolloutId, turnId }) as AggregatedTurnReport;
const turns = [turn("main", "a"), turn("child", "a"), turn("main", "b"), turn("child", "b")];
describe("turn navigation", () => {
  it("follows filtered plot order using both source and turn identity", () => {
    expect(adjacentTurn(turns, turns[1], -1)).toBe(turns[0]);
    expect(adjacentTurn(turns, turns[1], 1)).toBe(turns[2]);
    expect(adjacentTurn([turns[0], turns[3]], turns[0], 1)).toBe(turns[3]);
  });
  it("same-source navigation skips interleaved agents", () => {
    expect(adjacentTurn(turns, turns[1], 1, true)).toBe(turns[3]);
    expect(adjacentTurn(turns, turns[2], -1, true)).toBe(turns[0]);
  });
  it("stops at endpoints and does not navigate a removed selection", () => {
    expect(adjacentTurn(turns, turns[0], -1)).toBeNull();
    expect(adjacentTurn(turns, turns[3], 1)).toBeNull();
    expect(adjacentTurn(turns, turns[1], -1, true)).toBeNull();
    expect(adjacentTurn([], turns[0], 1)).toBeNull();
  });
});
