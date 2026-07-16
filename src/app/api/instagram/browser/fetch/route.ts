import { NextRequest, NextResponse } from "next/server"

/* ── POST /api/instagram/browser/fetch ──
 * Deprecated — use the DevTools console script on /connect page instead.
 * This method required Playwright/Chromium on the server which was flaky.
 */
export async function POST(request: NextRequest) {
  return NextResponse.json({
    ok: false,
    error: "Server-side browser fetch is deprecated. Use the DevTools Console method on the /connect page instead. It's more reliable — runs in YOUR browser with YOUR live login session.",
    method: "console-script",
  }, { status: 400 })
}
