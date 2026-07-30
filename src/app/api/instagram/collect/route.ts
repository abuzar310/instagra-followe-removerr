import { NextRequest } from "next/server"
import { spawn } from "child_process"
import { getScriptPath } from "@/lib/utils"
import { existsSync, unlinkSync, writeFileSync } from "fs"
import { join } from "path"
import { randomUUID } from "crypto"

export const dynamic = "force-dynamic"

let runningProcess: { process: ReturnType<typeof spawn>; startTime: number } | null = null

/* ── POST /api/instagram/collect ──
 * Spawns the Smart Collect script (alphabetical search in followers dialog).
 * Returns: SSE stream with log, progress, and done events.
 */
export async function POST(_req: NextRequest) {
  // Kill any existing collect process
  if (runningProcess) {
    try { runningProcess.process.kill("SIGTERM") } catch {}
    runningProcess = null
  }

  // Spawn the collect script
  const child = spawn("node", [getScriptPath("collect-followers.mjs")], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  })

  runningProcess = { process: child, startTime: Date.now() }

  // ── SSE setup ──
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, data: any) => {
        try {
          controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      // Collect stdout and parse SSE events
      let buffer = ""
      child.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString()
        const parts = buffer.split("\n\n")
        buffer = parts.pop() || ""

        for (const part of parts) {
          const lines = part.split("\n")
          let eventType = ""
          let eventData = ""

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim()
            if (line.startsWith("data: ")) eventData = line.slice(6)
          }

          if (eventType && eventData) {
            try {
              const parsed = JSON.parse(eventData)
              send(eventType, parsed)
            } catch {}
          }
        }
      })

      // Forward stderr as logs
      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim()
        if (text) send("log", { text })
      })

      child.on("close", (code) => {
        runningProcess = null
        if (code !== 0) {
          send("error", { message: `Script exited with code ${code}` })
        }
        try { controller.close() } catch {}
      })

      child.on("error", (err) => {
        runningProcess = null
        send("error", { message: err.message })
        try { controller.close() } catch {}
      })

      // Client disconnect — don't kill script, it's saving progress
      _req.signal.addEventListener("abort", () => {
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
