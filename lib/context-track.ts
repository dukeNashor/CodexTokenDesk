import { contextBands } from "./visualization-geometry";
import type { AggregatedTurnReport } from "./types";

export function trackBands(turn: AggregatedTurnReport) {
  const denominator = Math.max(1, turn.usage.total);
  const bands = contextBands(turn).map((band) => ({ ...band, start: band.start / denominator, end: band.end / denominator }));
  if (!bands.length) return [{ start: 0, end: 1, occupancyRate: turn.contextSnapshot.occupancyRate }];
  // An observation at the exact end has no width, but is still the endpoint
  // used to connect to the next round of this source.
  const last = [...turn.contextTimeline].sort((a, b) => a.turnTokenOffset - b.turnTokenOffset).at(-1);
  if (last && last.turnTokenOffset >= turn.usage.total && last.occupancyRate !== bands.at(-1)!.occupancyRate) {
    bands.push({ start: 1, end: 1, occupancyRate: last.occupancyRate });
  }
  return bands;
}

export function contextConnections(turns: AggregatedTurnReport[]) {
  const previous = new Map<string, { index: number; rate: number | null }>();
  const connections: Array<{ from: number; to: number; before: number; after: number }> = [];
  turns.forEach((turn, index) => {
    const bands = trackBands(turn);
    const prior = previous.get(turn.sourceRolloutId);
    const first = bands[0].occupancyRate;
    const startsWithCompaction = turn.contextCompactions.some((event) => event.turnTokenOffset <= 0);
    if (prior && prior.index === index - 1 && prior.rate !== null && first !== null && !startsWithCompaction) {
      connections.push({ from: prior.index, to: index, before: prior.rate, after: first });
    }
    // An unknown round breaks continuity even if a later known round exists.
    previous.set(turn.sourceRolloutId, { index, rate: bands.at(-1)!.occupancyRate });
  });
  return connections;
}

export const SOURCE_COLORS = ["#a2d18a", "#a6c9e9", "#cfb4e6", "#dfc58a", "#92cec2"];

/** Percentage-point change before filtering/paging; unknown rounds break the baseline. */
export function contextDeltas(turns: AggregatedTurnReport[]) {
  const previous = new Map<string, number | null>();
  const deltas = new Map<string, number | null>();
  for (const turn of turns) {
    const before = turn.contextBaselineRate !== undefined ? turn.contextBaselineRate : previous.has(turn.sourceRolloutId) ? previous.get(turn.sourceRolloutId) : 0;
    const after = turn.contextSnapshot.occupancyRate;
    deltas.set(`${turn.sourceRolloutId}:${turn.turnId}`, before == null || after == null ? null : after - before);
    previous.set(turn.sourceRolloutId, after ?? null);
  }
  return deltas;
}
