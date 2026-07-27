import { NextRequest } from "next/server"
import { spawn } from "child_process"
import { writeFileSync, unlinkSync, existsSync } from "fs"
import { join } from "path"
import { randomUUID } from "crypto"

// ── In-memory process tracker (single-user dev mode) ──
const runningProcesses = new Map<string, {
  process: ReturnType<typeof spawn>
  filePath: string
  startTime: number
}>()

type ProcessInfo = { process: ReturnType<typeof spawn>; filePath: string; startTime: number }

export function getRunningProcess(): ProcessInfo | null {
  let latest: ProcessInfo | null = null
  let latestTime = 0
  for (const proc of runningProcesses.values()) {
    if (proc.startTime > latestTime) {
      latestTime = proc.startTime
      latest = proc
    }
  }
  return latest
}

/* ── POST /api/unfollow/run ──
 * Accepts: { accounts, furious?, startFrom?: "first" | { type: "username", value: string } | { type: "number", value: number } }
 * Returns: SSE stream of unfollow progress
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { accounts, furious = false, startFrom } = body

  if (!Array.isArray(accounts) || accounts.length === 0) {
    return new Response(JSON.stringify({ error: "No accounts provided" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }

  // Kill any existing process
  for (const [id, proc] of runningProcesses) {
    try {
      proc.process.kill("SIGTERM")
    } catch {}
    runningProcesses.delete(id)
  }

  // Write temp JSON file
  const tmpId = randomUUID().slice(0, 8)
  const scriptsDir = join(process.cwd(), "scripts")
  const tmpFile = join(scriptsDir, `.unfollow-tmp-${tmpId}.json`)

  const data = accounts.map((a: any) => ({
    username: a.username,
    full_name: a.full_name || "",
    profile_pic_url: a.profile_pic_url || "",
  }))
  writeFileSync(tmpFile, JSON.stringify(data, null, 2))

  // Spawn the unfollow script
  const args = [join(scriptsDir, "unfollow-brave.mjs"), tmpFile]
  if (furious) args.push("-f")

  // Handle start-from options
  if (startFrom?.type === "username" && startFrom.value) {
    args.push("-u", startFrom.value)
  } else if (startFrom?.type === "number" && startFrom.value > 0) {
    args.push("-n", String(startFrom.value))
  } else {
    // Start from first account — delete stale progress file
    const progressFile = join(scriptsDir, ".brave-unfollow-progress.json")
    try { if (existsSync(progressFile)) unlinkSync(progressFile) } catch {}
  }

  // Spawn WITHOUT shell to avoid spaces-in-path issues (e.g. "New folder")
  const child = spawn("node", args, {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  })

  const processId = randomUUID()
  runningProcesses.set(processId, {
    process: child,
    filePath: tmpFile,
    startTime: Date.now(),
  })

  // ── SSE setup ──
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, data: any) => {
        try {
          controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      let outputBuffer = ""
      const onData = (chunk: Buffer) => {
        outputBuffer += chunk.toString()
        const lines = outputBuffer.split("\n")
        outputBuffer = lines.pop() || "" // keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            // Parse progress info from log lines
            const stats: Record<string, any> = {}
            const removedMatch = line.match(/✅.*removed/)
            const skippedMatch = line.match(/⏭.*skipped/)
            const errorMatch = line.match(/❌.*error/)
            const progressMatch = line.match(/\((\d+)\/(\d+)\)/)

            if (removedMatch) stats.lastAction = "removed"
            else if (skippedMatch) stats.lastAction = "skipped"
            else if (errorMatch) stats.lastAction = "error"

            if (progressMatch) {
              stats.current = parseInt(progressMatch[1])
              stats.total = parseInt(progressMatch[2])
            }

            // Detect block
            if (line.includes("BLOCKED") || line.includes("rate-limited") || line.includes("STOPPED AUTOMATICALLY")) {
              stats.blocked = true
            }

            // Detect session info
            const sessionMatch = line.match(/SESSION #(\d+)/)
            if (sessionMatch) stats.session = parseInt(sessionMatch[1])

            send("log", { text: line, ...stats })
          }
        }
      }

      child.stdout?.on("data", onData)
      child.stderr?.on("data", onData)

      child.on("close", (code) => {
        // Clean up temp file
        try { if (existsSync(tmpFile)) unlinkSync(tmpFile) } catch {}
        runningProcesses.delete(processId)

        send("done", {
          code,
          message: code === 0 ? "All done!" : `Exited with code ${code}`,
        })
        try { controller.close() } catch {}
      })

      child.on("error", (err) => {
        send("error", { message: err.message })
        try { controller.close() } catch {}
      })

      // Cleanup on client disconnect
      req.signal.addEventListener("abort", () => {
        try { child.kill("SIGTERM") } catch {}
        try { if (existsSync(tmpFile)) unlinkSync(tmpFile) } catch {}
        runningProcesses.delete(processId)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  })
}
