import { NextResponse } from "next/server"
import { getRunningProcess } from "../run/route"

/* ── POST /api/unfollow/stop ──
 * Kills the currently running unfollow process (if any).
 * Progress is saved by the script before exiting.
 */
export async function POST() {
  const proc = getRunningProcess()
  if (!proc) {
    return NextResponse.json({ ok: false, message: "No running process" })
  }

  try {
    proc.process.kill("SIGTERM")
    // Give it a moment to save progress, then force kill
    setTimeout(() => {
      try { proc.process.kill("SIGKILL") } catch {}
    }, 3000)
  } catch (err) {
    return NextResponse.json({ ok: false, message: String(err) })
  }

  return NextResponse.json({ ok: true, message: "Process stopped" })
}
