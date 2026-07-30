export const dynamic = "force-dynamic";

import { NextRequest } from "next/server"
import { spawn } from "child_process"
import { writeFileSync, unlinkSync, existsSync } from "fs"
import { join } from "path"
import { randomUUID } from "crypto"
import { getScriptPath } from "@/lib/utils"

// ── In-memory process tracker ──
let runningProcess: { process: ReturnType<typeof spawn>; filePath: string } | null = null

/* ── POST /api/cross-check/run ──
 * Accepts: { followers: { username: string }[] }
 * Returns: SSE stream of check progress
 */
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { followers } = body

  if (!Array.isArray(followers) || followers.length === 0) {
    return new Response(JSON.stringify({ error: "No followers provided" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }

  // Kill any existing process
  if (runningProcess) {
    try { runningProcess.process.kill("SIGTERM") } catch {}
    runningProcess = null
  }

  // Write temp JSON file
  const tmpId = randomUUID().slice(0, 8)
  const tmpFile = join(process.cwd(), "scripts", `.check-tmp-${tmpId}.json`)
  writeFileSync(tmpFile, JSON.stringify(followers.map((a: any) => ({ username: a.username })), null, 2))

  // Spawn the check script
  const args = [getScriptPath("check-followers.mjs"), tmpFile]
  const child = spawn("node", args, {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  })

  runningProcess = { process: child, filePath: tmpFile }

  // ── SSE setup ──
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const send = (type: string, data: any) => {
        try {
          controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      const onData = (chunk: Buffer) => {
        const text = chunk.toString()
        // Parse SSE events from script stdout
        const lines = text.split("\n")
        let eventType = ""
        for (const line of lines) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim()
          else if (line.startsWith("data: ") && eventType) {
            try {
              const data = JSON.parse(line.slice(6))
              send(eventType, data)
            } catch {}
            eventType = ""
          }
        }

        // Also forward stderr as log events
      }

      child.stdout?.on("data", onData)

      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString().trim()
        if (text) {
          send("log", { text })
        }
      })

      child.on("close", (code) => {
        try { if (existsSync(tmpFile)) unlinkSync(tmpFile) } catch {}
        runningProcess = null
        send("done", { code, message: code === 0 ? "Check complete!" : `Exited with code ${code}` })
        try { controller.close() } catch {}
      })

      child.on("error", (err) => {
        send("error", { message: err.message })
        try { controller.close() } catch {}
      })

      req.signal.addEventListener("abort", () => {
        try { child.kill("SIGTERM") } catch {}
        try { if (existsSync(tmpFile)) unlinkSync(tmpFile) } catch {}
        runningProcess = null
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
