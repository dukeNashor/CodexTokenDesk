export type CurvePoint = readonly [number, number];

/** Resolve overlapping hit strokes by visible geometry, not SVG paint order. */
export function nearestCurve<T extends { points: CurvePoint[] }>(curves: T[], point: CurvePoint, isLocal: (curve: T) => boolean): T | null {
  let best: T | null = null;
  let distance = Infinity;
  for (const curve of curves) {
    for (let i = 1; i < curve.points.length; i++) {
      const [ax, ay] = curve.points[i - 1], [bx, by] = curve.points[i];
      const dx = bx - ax, dy = by - ay;
      const length = dx * dx + dy * dy;
      const fraction = length ? Math.max(0, Math.min(1, ((point[0] - ax) * dx + (point[1] - ay) * dy) / length)) : 0;
      const squared = (point[0] - ax - fraction * dx) ** 2 + (point[1] - ay - fraction * dy) ** 2;
      if (squared < distance - 1e-6 || (Math.abs(squared - distance) <= 1e-6 && isLocal(curve) && (!best || !isLocal(best)))) {
        best = curve;
        distance = squared;
      }
    }
  }
  return best;
}
