import { describe, expect, it } from "vitest";

import { DEFAULT_VISIBLE_TOOL_CATEGORIES, filterToolsByCategory } from "@/lib/tool-display";

describe("tool display", () => {
  const tools = [
    { name: "computer", category: "computer-use" },
    { name: "chrome", category: "chrome-use" },
    { name: "imagegen", category: "imagegen" },
    { name: "search", category: "web-search" },
    { name: "exec", category: "shell" },
    { name: "agents", category: "function-calling" },
  ];

  it("defaults to the four legacy high-level categories", () => {
    expect(filterToolsByCategory(tools, new Set(DEFAULT_VISIBLE_TOOL_CATEGORIES)).map((tool) => tool.name)).toEqual([
      "computer", "chrome", "imagegen", "search",
    ]);
  });

  it("treats an empty selection as no visible tool satellites", () => {
    expect(filterToolsByCategory(tools, new Set())).toEqual([]);
  });
});
