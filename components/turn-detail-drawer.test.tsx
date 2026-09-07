import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordText } from "./turn-detail-drawer";
describe("record rendering", () => {
  it("renders markdown structure and GFM tables", () => {
    const result = renderToStaticMarkup(<RecordText raw={false} text={"**Result**\n\n| A | B |\n| - | - |\n| 1 | 2 |"} />);
    expect(result).toContain("<strong>Result</strong>");
    expect(result).toContain("<table>");
  });
  it("retains exact source in raw view", () => {
    expect(renderToStaticMarkup(<RecordText raw text={"**Result**\n<test>"} />)).toContain("**Result**\n&lt;test&gt;");
  });
  it("does not execute embedded HTML or unsafe markdown URLs", () => {
    const result = renderToStaticMarkup(<RecordText raw={false} text={'<script>alert(1)</script>\n\n[x](javascript:alert(1))'} />);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain('href="javascript:');
  });
});
