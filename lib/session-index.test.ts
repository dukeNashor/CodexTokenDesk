import { describe, expect, it } from "vitest";

import { parseSessionIndex, signaturesEqual } from "@/lib/session-index";

describe("session index", () => {
  it("loads valid local titles, normalizes ids, and lets later records win", () => {
    const names = parseSessionIndex([
      JSON.stringify({ id: "ABC", thread_name: "旧标题" }),
      "not-json",
      JSON.stringify({ id: "abc", thread_name: " 新标题 " }),
      JSON.stringify({ id: "ignored", thread_name: "" }),
    ].join("\n"));

    expect(names).toEqual(new Map([["abc", "新标题"]]));
  });

  it("detects size, timestamp, addition, and removal changes", () => {
    const current = new Map([["index", { size: 10, mtimeMs: 20 }]]);
    expect(signaturesEqual(current, new Map([["index", { size: 10, mtimeMs: 20 }]]))).toBe(true);
    expect(signaturesEqual(current, new Map([["index", { size: 11, mtimeMs: 20 }]]))).toBe(false);
    expect(signaturesEqual(current, new Map())).toBe(false);
  });
});
