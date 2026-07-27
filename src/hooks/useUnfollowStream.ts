"use client"

import { useState, useRef, useCallback } from "react"

export type UnfollowLog = {
  text: string
  stderr?: boolean
  lastAction?: "removed" | "skipped" | "error"
  current?: number
  total?: number
  session?: number
  blocked?: boolean
}

export type UnfollowState = {
  status: "idle" | "running" | "stopped" | "done" | "error"
  logs: UnfollowLog[]
  removed: number
  skipped: number
  errors: number
  current: number
  total: number
  session: number
  blocked: boolean
  message: string
}

const initialState: UnfollowState = {
  status: "idle",
  logs: [],
  removed: 0,
  skipped: 0,
  errors: 0,
  current: 0,
  total: 0,
  session: 1,
  blocked: false,
  message: "",
}

export function useUnfollowStream() {
  const [state, setState] = useState<UnfollowState>(initialState)
  const abortRef = useRef<AbortController | null>(null)

  const parseProgress = useCallback((text: string) => {
    const updates: Partial<UnfollowState> = {}

    // Parse: ✓ N removed, ⏭ N skipped, ❌ N errors
    const removedMatch = text.match(/✓\s*([\d,]+)\s*removed/)
    if (removedMatch) updates.removed = parseInt(removedMatch[1].replace(/,/g, ""))

    const skippedMatch = text.match(/⏭\s*([\d,]+)\s*skipped/)
    if (skippedMatch) updates.skipped = parseInt(skippedMatch[1].replace(/,/g, ""))

    const errorsMatch = text.match(/✗\s*([\d,]+)\s*errors/)
    if (errorsMatch) updates.errors = parseInt(errorsMatch[1].replace(/,/g, ""))

    // Parse: (#N/M)
    const progressMatch = text.match(/\((\d+)\/(\d+)\)/)
    if (progressMatch) {
      updates.current = parseInt(progressMatch[1])
      updates.total = parseInt(progressMatch[2])
    }

    // Parse session
    const sessionMatch = text.match(/SESSION #(\d+)/)
    if (sessionMatch) updates.session = parseInt(sessionMatch[1])

    return updates
  }, [])

  const start = useCallback(async (accounts: { username: string }[], furious = false) => {
    // Abort any existing stream
    if (abortRef.current) {
      abortRef.current.abort()
    }

    const abort = new AbortController()
    abortRef.current = abort

    setState({
      ...initialState,
      status: "running",
      total: accounts.length,
    })

    try {
      const response = await fetch("/api/unfollow/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accounts, furious }),
        signal: abort.signal,
      })

      if (!response.ok) {
        setState((s) => ({ ...s, status: "error", message: `HTTP ${response.status}` }))
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        setState((s) => ({ ...s, status: "error", message: "No response body" }))
        return
      }

      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split("\n\n")
        buffer = events.pop() || ""

        for (const event of events) {
          const lines = event.split("\n")
          let eventType = ""
          let eventData = ""

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7)
            if (line.startsWith("data: ")) eventData = line.slice(6)
          }

          if (!eventData) continue

          try {
            const parsed = JSON.parse(eventData)

            if (eventType === "log") {
              const updates = parseProgress(parsed.text || "")
              setState((s) => ({
                ...s,
                logs: [...s.logs.slice(-200), { text: parsed.text, ...parsed }],
                ...updates,
                blocked: parsed.blocked || s.blocked,
              }))
            } else if (eventType === "done") {
              setState((s) => ({
                ...s,
                status: "done",
                message: parsed.message || "All done!",
              }))
            } else if (eventType === "error") {
              setState((s) => ({
                ...s,
                status: "error",
                message: parsed.message || "Unknown error",
              }))
            }
          } catch {}
        }
      }

      // Stream ended naturally
      setState((s) => {
        if (s.status === "running") return { ...s, status: "done", message: "Process completed" }
        return s
      })
    } catch (err: any) {
      if (err.name === "AbortError") {
        setState((s) => ({ ...s, status: "stopped", message: "Stopped by user" }))
      } else {
        setState((s) => ({ ...s, status: "error", message: err.message }))
      }
    }
  }, [parseProgress])

  const stop = useCallback(async () => {
    // Send stop signal to server
    try {
      await fetch("/api/unfollow/stop", { method: "POST" })
    } catch {}

    // Abort the SSE stream
    if (abortRef.current) {
      abortRef.current.abort()
    }

    setState((s) => ({
      ...s,
      status: "stopped",
      message: "Stopped by user — progress saved, resume with --resume",
      logs: [...s.logs, { text: "⏹️ Stopped by user. Progress saved!" }],
    }))
  }, [])

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    setState(initialState)
  }, [])

  return { state, start, stop, reset }
}
