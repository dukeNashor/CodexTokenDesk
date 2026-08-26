import { describe, expect, it } from "vitest";

import { formatCount, formatTokens, isLcdValue } from "@/lib/token-display";

describe("token display", () => {
  it("uses the legacy four-digit thin-space grouping for raw values", () => {
    expect(formatTokens(123_456_789, "raw")).toBe("1 2345 6789");
    expect(formatCount(12_345)).toBe("1 2345");
  });

  it("applies one global unit convention", () => {
    expect(formatTokens(1_250, "K")).toBe("1.3K");
    expect(formatTokens(1_000_000, "M")).toBe("1M");
    expect(formatTokens(2_500_000_000, "B")).toBe("2.5B");
  });

  it("never rounds a positive token count down to a displayed zero", () => {
    expect(formatTokens(49, "K")).toBe("<0.1K");
    expect(formatTokens(49_999, "M")).toBe("<0.1M");
    expect(formatTokens(49_999_999, "B")).toBe("<0.1B");
    expect(formatTokens(0, "B")).toBe("0B");
  });

  it("recognizes numeric summary values for LCD styling", () => {
    expect(isLcdValue("12.5M")).toBe(true);
    expect(isLcdValue("3 / 2")).toBe(false);
  });
});
