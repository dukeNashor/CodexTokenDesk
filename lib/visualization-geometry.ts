import type { AggregatedTurnReport } from "@/lib/types";

const GAP_RADIANS = Math.PI / 180;
const START_RADIANS = -Math.PI / 2 + GAP_RADIANS / 2;
const SPAN_RADIANS = Math.PI * 2 - GAP_RADIANS;

export type RadialEntry = {
  turn: AggregatedTurnReport;
  tokens: number;
  tokenStart: number;
  start: number;
  end: number;
  middle: number;
  satellite: boolean;
  parent: AggregatedTurnReport | null;
  lane: number;
};

export function radialPoint(cx: number, cy: number, radius: number, fraction: number): { x: number; y: number } {
  const angle = START_RADIANS + Math.max(0, Math.min(1, fraction)) * SPAN_RADIANS;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

export function arcLinePath(cx: number, cy: number, radius: number, start: number, end: number): string {
  if (end - start <= 1e-9) return "";
  const a = radialPoint(cx, cy, radius, start);
  const b = radialPoint(cx, cy, radius, end);
  const large = (end - start) * SPAN_RADIANS > Math.PI ? 1 : 0;
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)} A${radius},${radius} 0 ${large} 1 ${b.x.toFixed(2)},${b.y.toFixed(2)}`;
}

export function arcBandPath(cx: number, cy: number, inner: number, outer: number, start: number, end: number): string {
  if (end - start <= 1e-9) return "";
  const a = radialPoint(cx, cy, outer, start);
  const b = radialPoint(cx, cy, outer, end);
  const c = radialPoint(cx, cy, inner, end);
  const d = radialPoint(cx, cy, inner, start);
  const large = (end - start) * SPAN_RADIANS > Math.PI ? 1 : 0;
  return `M${a.x.toFixed(2)},${a.y.toFixed(2)} A${outer},${outer} 0 ${large} 1 ${b.x.toFixed(2)},${b.y.toFixed(2)} L${c.x.toFixed(2)},${c.y.toFixed(2)} A${inner},${inner} 0 ${large} 0 ${d.x.toFixed(2)},${d.y.toFixed(2)} Z`;
}

export function radialEntries(turns: AggregatedTurnReport[]): RadialEntry[] {
  const total = Math.max(1, turns.reduce((sum, turn) => sum + Math.max(0, turn.usage.total), 0));
  const sourceLanes = new Map<string, number>();
  let nextLane = 0;
  let consumed = 0;
  let lastMain: AggregatedTurnReport | null = null;
  return turns.map((turn) => {
    const tokens = Math.max(0, turn.usage.total);
    const start = consumed / total;
    const end = (consumed + tokens) / total;
    const satellite = turn.sourceKind === "subagent";
    if (!satellite) lastMain = turn;
    let lane = 0;
    if (satellite) {
      if (!sourceLanes.has(turn.sourceRolloutId)) sourceLanes.set(turn.sourceRolloutId, nextLane++);
      lane = sourceLanes.get(turn.sourceRolloutId) ?? 0;
    }
    const entry = { turn, tokens, tokenStart: consumed, start, end, middle: tokens ? (start + end) / 2 : start, satellite, parent: satellite ? lastMain : null, lane };
    consumed += tokens;
    return entry;
  });
}

export function contextBands(turn: AggregatedTurnReport): Array<{ start: number; end: number; occupancyRate: number | null }> {
  const tokens = Math.max(0, turn.usage.total);
  if (!tokens) return [];
  const points = [...turn.contextTimeline]
    .map((point) => ({ offset: Math.max(0, Math.min(tokens, point.turnTokenOffset)), occupancyRate: point.occupancyRate }))
    .sort((left, right) => left.offset - right.offset);
  if (!points.length) return [{ start: 0, end: tokens, occupancyRate: turn.contextSnapshot.occupancyRate }];
  const bands: Array<{ start: number; end: number; occupancyRate: number | null }> = [];
  let cursor = 0;
  let latest: number | null = points[0].occupancyRate;
  for (const point of points) {
    if (point.offset > cursor) bands.push({ start: cursor, end: point.offset, occupancyRate: latest });
    cursor = point.offset;
    latest = point.occupancyRate;
  }
  if (cursor < tokens) bands.push({ start: cursor, end: tokens, occupancyRate: latest });
  return bands;
}

export function donutSegments<T>(items: T[], value: (item: T) => number): Array<{ item: T; start: number; end: number; value: number }> {
  const values = items.map((item) => Math.max(0, value(item)));
  const total = values.reduce((sum, item) => sum + item, 0);
  let consumed = 0;
  return items.map((item, index) => {
    const current = values[index];
    const start = total ? consumed / total : 0;
    consumed += current;
    return { item, start, end: total ? consumed / total : 0, value: current };
  });
}
