import { describe, expect, it } from "vitest";
import { formatCreditUsd } from "@/lib/credit-display";

describe("integer dollar equivalent display", () => {
  it.each([[0, "$0"], [1, "$0"], [12.49, "$0"], [12.5, "$1"], [1000, "$40"], [21868, "$875"], [308650, "$12,346"]] as const)("converts %s credits to %s before rounding", (value, expected) => {
    expect(formatCreditUsd(value)).toBe(expected);
  });
});
