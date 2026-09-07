import { describe, it, expect } from "vitest";
import { scaleWindowSize } from "./track-scale-lever";
describe("relative scale stops", () => {
  it("scales from automatic and caps at the filtered total", () => {
    expect(scaleWindowSize(0, 13, 100)).toBe(13);
    expect(scaleWindowSize(1.5, 13, 100)).toBe(20);
    expect(scaleWindowSize(6, 13, 19)).toBe(19);
  });
  it("shows every turn regardless of automatic capacity", () => {
    expect(scaleWindowSize(-1, 2, 1000)).toBe(1000);
    expect(scaleWindowSize(-1, 13, 0)).toBe(1);
  });
});
