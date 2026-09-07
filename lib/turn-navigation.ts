import type { AggregatedTurnReport } from "./types";

export function adjacentTurn(turns: AggregatedTurnReport[], current: AggregatedTurnReport, direction: -1 | 1, sameSource = false) {
  const index = turns.findIndex(turn => turn.turnId === current.turnId && turn.sourceRolloutId === current.sourceRolloutId);
  if (index < 0) return null;
  for (let next = index + direction; next >= 0 && next < turns.length; next += direction) {
    if (!sameSource || turns[next].sourceRolloutId === current.sourceRolloutId) return turns[next];
  }
  return null;
}
