import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "Codex Token Desk",
      instanceId: process.env.CODEX_TOKEN_DESK_INSTANCE_ID ?? null,
      pollIntervalMs: 3000,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
