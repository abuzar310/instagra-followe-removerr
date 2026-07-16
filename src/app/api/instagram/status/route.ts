import { NextResponse } from "next/server"

/* ── GET /api/instagram/status ──
 * Simple health check — no browser profile needed anymore
 * since we fetch through the DevTools console method.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    method: "console-script",
    note: "Open Instagram in your browser, run the script from /connect, then paste the JSON here.",
  })
}
