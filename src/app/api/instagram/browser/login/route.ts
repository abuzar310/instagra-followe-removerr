import { NextResponse } from "next/server"

/* ── POST /api/instagram/browser/login ──
 * Login via headed browser is deprecated — use the DevTools console
 * method on the /connect page instead.
 */
export async function POST() {
  return NextResponse.json({
    ok: false,
    error: "Browser login is deprecated. Use the DevTools Console method on the /connect page instead.",
    method: "console-script",
  }, { status: 400 })
}
