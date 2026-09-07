import { describe, expect, it } from "vitest";
import { nearestCurve, type CurvePoint } from "./curve-hit";
const curve = (id: string, points: CurvePoint[]) => ({id, points});
describe("overlapping Context hit areas", () => {
  const main = curve("main", [[20, 50], [80, 50]]);
  const child = curve("child", [[0, 55], [100, 55], [100, 80]]);
  it("reaches both curves inside overlapping 14px hit strokes regardless of paint order", () => {
    for (const curves of [[main, child], [child, main]]) {
      expect(nearestCurve(curves, [40, 51], c => c.id === "main")).toBe(main);
      expect(nearestCurve(curves, [40, 54], c => c.id === "main")).toBe(child);
    }
  });
  it("prefers the current column at exact crossings and still resolves vertical segments", () => {
    const crossing = curve("child", [[40, 20], [40, 80]]);
    expect(nearestCurve([crossing, main], [40, 50], c => c.id === "main")).toBe(main);
    expect(nearestCurve([main, crossing], [40, 50], c => c.id === "main")).toBe(main);
    expect(nearestCurve([main, crossing], [41, 70], c => c.id === "main")).toBe(crossing);
  });
  it("handles zero-width observations and line endpoints", () => {
    const point = curve("point", [[10, 10], [10, 10]]);
    expect(nearestCurve([main, point], [10, 11], () => false)).toBe(point);
    expect(nearestCurve([], [0, 0], () => false)).toBeNull();
  });
});
