import { describe, expect, it } from "vitest";

import { filterNavigationSessions, modelWatermarkLabel, navigationEffortLabel, navigationModelColor, retainAvailableModelSelection, summarySessionIds, visibleProjectIdsForSessions } from "@/lib/session-navigation";
import type { SessionNavigationItem, Usage } from "@/lib/types";

const usage = (total: number): Usage => ({ input: total, cached: 0, cache_write: 0, output: 0, reasoning: 0, total });

function session(id: string, projectId: string, turnCount: number, models: string[]): SessionNavigationItem {
  return {
    metadata: {
      threadId: id,
      title: `${id} title`,
      projectId,
      projectLabel: `${projectId} project`,
      primaryModel: models[0] ?? "未知模型",
      efforts: [],
      sourceKinds: ["main"],
      rolloutCount: 1,
      firstActivityAt: null,
      lastActivityAt: null,
    },
    total: { turnCount, usage: usage(turnCount * 10) },
    range: {
      turnCount,
      usage: usage(turnCount * 10),
      lastActivityAt: null,
      modelUsage: models.map((model) => ({ model, rawTokens: 10 })),
    },
  };
}

describe("session navigation filtering", () => {
  const sessions = [
    session("sol", "p1", 2, ["GPT-5.6 Sol"]),
    session("luna", "p2", 1, ["GPT-5.6 Luna"]),
    session("old", "p3", 0, ["GPT-5.6 Luna"]),
  ];

  it("intersects date activity, actual range models, and search text", () => {
    expect(filterNavigationSessions(sessions, new Set(), "").map((item) => item.metadata.threadId)).toEqual(["sol", "luna"]);
    expect(filterNavigationSessions(sessions, new Set(["GPT-5.6 Luna"]), "").map((item) => item.metadata.threadId)).toEqual(["luna"]);
    expect(filterNavigationSessions(sessions, new Set(), "luna").map((item) => item.metadata.threadId)).toEqual(["luna"]);
    expect(filterNavigationSessions(sessions, new Set(["GPT-5.6 Luna"]), "sol")).toEqual([]);
  });

  it("returns only projects that still contain a visible session", () => {
    const visible = filterNavigationSessions(sessions, new Set(["GPT-5.6 Luna"]), "");
    expect(visibleProjectIdsForSessions(visible)).toEqual(new Set(["p2"]));
  });

  it("drops model selections that are no longer available in the date range", () => {
    expect(retainAvailableModelSelection(new Set(["GPT-5.6 Sol", "GPT-5.6 Luna"]), [{ model: "GPT-5.6 Sol", rawTokens: 10 }])).toEqual(new Set(["GPT-5.6 Sol"]));
  });

  it("uses all filtered sessions for projects and preserves manual recent selections", () => {
    const filtered = filterNavigationSessions(sessions, new Set(["GPT-5.6 Luna"]), "");
    const recent = new Set(["sol", "old"]);
    expect(summarySessionIds("project", filtered, recent)).toEqual(["luna"]);
    expect(summarySessionIds("recent", filtered, recent)).toEqual(["sol", "old"]);
  });

  it("matches the legacy model watermark labels and Spark color", () => {
    expect(modelWatermarkLabel("GPT-5.6 Sol")).toBe("SOL");
    expect(modelWatermarkLabel("GPT-5.4 mini")).toBe("5.4 MINI");
    expect(modelWatermarkLabel("GPT-5.3 Codex")).toBe("5.3 CODEX");
    expect(modelWatermarkLabel("gpt-5.3-codex-spark")).toBe("Spark");
    expect(navigationModelColor("Spark")).toBe("#c23b75");
  });

  it("uses the legacy effort label structure", () => {
    expect(navigationEffortLabel(["medium", "high", "medium"])).toBe("medium / high");
    expect(navigationEffortLabel([])).toBe("未记录 effort");
  });
});
