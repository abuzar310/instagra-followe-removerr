import { NextRequest, NextResponse } from "next/server"

/* ── UNFOLLOW ──
 *
 * Server-side unfollow via Playwright is deprecated.
 * Instagram's anti-bot detection flags headless Chromium, making cookie
 * injection unreliable. Instead, use the DevTools Console Script method:
 *
 *   1. Go to /unfollow page
 *   2. Click "Generate Script"
 *   3. Paste the script into Instagram's DevTools Console (logged in)
 *   4. The script runs in YOUR browser with YOUR real session
 *   5. Paste the results back in the app
 *
 * This route exists only to inform users of the new method.
 */

export async function POST() {
  return NextResponse.json(
    {
      error: "Server-side unfollow is deprecated. Use the DevTools Console approach.",
      detail: "Go to /unfollow, generate the console script, paste it in Instagram's DevTools console.",
      solution: "The console script runs in your own browser with your real login session — no cookie issues.",
    },
    { status: 400 }
  )
}
