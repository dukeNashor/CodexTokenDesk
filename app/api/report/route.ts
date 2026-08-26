import { NextResponse } from "next/server";

import { liveStore } from "@/lib/live-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function queryFromUrl(url: URL) {
  const projects = url.searchParams.getAll("project").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean);
  const requestedRange = url.searchParams.get("range");
  const range = ["today", "7d", "30d", "all", "custom"].includes(requestedRange ?? "")
    ? requestedRange as "today" | "7d" | "30d" | "all" | "custom"
    : undefined;
  return {
    projectIds: projects,
    range,
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    sessionId: url.searchParams.get("session"),
  };
}

async function responseFor(request: Request, selectedSessionIds?: string[]) {
  try {
    const url = new URL(request.url);
    const snapshot = await liveStore.snapshot({
      ...queryFromUrl(url),
      selectedSessionIds,
    });
    return NextResponse.json(snapshot, {
      headers: { "Cache-Control": "no-store, max-age=0", "X-Live-Poll-Interval": String(snapshot.server.pollIntervalMs) },
    });
  } catch (error) {
    return NextResponse.json({ error: { code: "REPORT_FAILED", message: error instanceof Error ? error.message : "实时报告生成失败" } }, { status: 500 });
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const selectedSessionIds = url.searchParams.get("selection") === "explicit"
    ? url.searchParams.getAll("selectedSession").flatMap((value) => value.split(",")).map((value) => value.trim()).filter(Boolean)
    : undefined;
  return responseFor(request, selectedSessionIds);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { selectedSessionIds?: unknown };
    const selectedSessionIds = Array.isArray(body.selectedSessionIds) ? body.selectedSessionIds.filter((value): value is string => typeof value === "string") : [];
    return responseFor(request, selectedSessionIds);
  } catch {
    return NextResponse.json({ error: { code: "INVALID_SELECTION", message: "会话选择请求无效" } }, { status: 400 });
  }
}
