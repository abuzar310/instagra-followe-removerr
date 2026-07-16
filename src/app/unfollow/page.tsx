"use client"

import { useState, useEffect, useCallback } from "react"
import {
  getInstagramCookies,
  getUnfollowQueue,
  saveUnfollowQueue,
  clearUnfollowQueue,
  getFollowers,
} from "@/lib/store"
import { generateUnfollowScript } from "@/lib/ig-unfollow-script"
import type { InstagramCookies, Follower, UnfollowEntry, UnfollowStatus } from "@/lib/types"
import { UserMinus, Copy, Check, Play, Plus, Trash2, AlertCircle, Terminal, ClipboardPaste } from "lucide-react"

const CYCLE_HOURS = 6

export default function UnfollowPage() {
  const [profiles, setProfiles] = useState<Follower[]>([])
  const [cookies, setCookies] = useState<InstagramCookies | null>(null)
  const [queue, setQueue] = useState<UnfollowEntry[]>([])
  const [script, setScript] = useState<string>("")
  const [showScript, setShowScript] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pasteInput, setPasteInput] = useState("")
  const [log, setLog] = useState<string[]>([])
  const [step, setStep] = useState<"queue" | "script" | "results">("queue")

  const refresh = useCallback(() => {
    setProfiles(getFollowers())
    setCookies(getInstagramCookies())
    setQueue(getUnfollowQueue())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const approvedProfiles = profiles.filter(p => p.approved === true)
  const doneCount = queue.filter(e => e.status === "done").length
  const errorCount = queue.filter(e => e.status === "error").length
  const queuedCount = queue.filter(e => e.status === "queued").length

  // Prepare queue from approved accounts
  const prepareQueue = () => {
    const alreadyQueued = new Set(queue.map(e => e.profileId))
    const entries: UnfollowEntry[] = approvedProfiles
      .filter(p => !alreadyQueued.has(p.id))
      .map(p => ({
        profileId: p.id,
        username: p.username,
        fullName: p.full_name,
        status: "queued" as UnfollowStatus,
      }))
    const newQueue = [...queue, ...entries]
    saveUnfollowQueue(newQueue)
    setQueue(newQueue)
    addLog(`Added ${entries.length} approved accounts to queue`)
    setStep("queue")
  }

  const clearQueue = () => {
    clearUnfollowQueue()
    setQueue([])
    setScript("")
    setShowScript(false)
    setPasteInput("")
    setStep("queue")
    setLog([])
  }

  const addLog = (msg: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
  }

  const handleGenerate = () => {
    const queued = queue.filter(e => e.status === "queued")
    if (queued.length === 0) return
    const generated = generateUnfollowScript(queued, CYCLE_HOURS)
    setScript(generated)
    setShowScript(true)
    setStep("script")
    addLog(`Generated unfollow script for ${queued.length} accounts`)
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(script)
      setCopied(true)
      addLog("Script copied to clipboard")
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback: select the textarea
      addLog("Clipboard failed — select and copy manually")
    }
  }

  const handlePasteResults = () => {
    if (!pasteInput.trim()) return
    try {
      const data = JSON.parse(pasteInput.trim())
      if (!data.results || !Array.isArray(data.results)) {
        addLog("Invalid results format — expected { results: [...] }")
        return
      }

      const q = [...queue]
      let updated = 0
      for (const r of data.results) {
        const idx = q.findIndex(e => e.profileId === r.userId)
        if (idx === -1) continue
        q[idx] = {
          ...q[idx],
          status: r.success ? "done" : "error",
          error: r.success ? undefined : (r.error || "Unknown error"),
          unfollowedAt: r.success ? (data.completedAt || new Date().toISOString()) : undefined,
        }
        updated++
      }
      saveUnfollowQueue(q)
      setQueue(q)
      addLog(`Imported results: ${data.succeeded || 0} unfollowed, ${data.failed || 0} failed, ${updated} updated`)
      setStep("results")
      setPasteInput("")
    } catch (e) {
      addLog("Failed to parse results: " + (e instanceof Error ? e.message : "Invalid JSON"))
    }
  }

  const entriesInScript = queue.filter(e => e.status === "queued")
  const hasResults = queue.some(e => e.status === "done" || e.status === "error")

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Unfollow Scheduler</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            {hasResults
              ? `${doneCount} unfollowed · ${errorCount} failed`
              : queue.length > 0
              ? `${queuedCount} accounts ready · ${doneCount} done · ${errorCount} failed`
              : "Approve accounts in the review queue, then come here"}
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/review" className="btn btn-ghost text-sm">Review Queue</a>
        </div>
      </div>

      {/* No cookies warning — repurposed as Connect reminder */}
      {!cookies && (
        <div className="flex items-start gap-2.5 bg-[rgba(234,179,8,0.1)] border border-[rgba(234,179,8,0.2)] rounded-xl p-4 text-sm text-[#eab308]">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>No Instagram session found. <a href="/connect" className="underline">Connect your account</a> first to fetch follower data.</span>
        </div>
      )}

      {/* Step progress indicator */}
      <div className="flex items-center gap-2 text-xs">
        {[
          { key: "queue", label: "Queue accounts" },
          { key: "script", label: "Run script in Instagram" },
          { key: "results", label: "Import results" },
        ].map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
              step === s.key ? "bg-white text-black" :
              ["results", "script"].includes(step) && s.key === "queue" ? "bg-[#22c55e] text-white" :
              step === "results" && s.key === "script" ? "bg-[#22c55e] text-white" :
              "bg-[#27272a] text-[#52525b]"
            }`}>
              {(["results", "script"].includes(step) && s.key === "queue") || (step === "results" && s.key === "script") ? "✓" : i + 1}
            </span>
            <span className={`${step === s.key ? "text-white" : "text-[#52525b]"}`}>{s.label}</span>
            {i < 2 && <span className="text-[#27272a] ml-1">→</span>}
          </div>
        ))}
      </div>

      {/* Empty state */}
      {queue.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <UserMinus size={48} className="text-[#27272a] mb-4" />
          <h2 className="text-lg font-semibold text-white/60 mb-2">No accounts to unfollow</h2>
          <p className="text-sm text-[#52525b] max-w-sm mb-6">
            Go to the review queue, approve accounts you want to unfollow, then come back here to add them to the queue.
          </p>
          <a href="/review" className="btn btn-primary">Review Queue</a>
        </div>
      )}

      {/* Queue Controls */}
      {queue.length > 0 && (
        <div className="card p-5">
          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              ["Queued", queuedCount, ""],
              ["Done", doneCount, doneCount > 0 ? "text-[#22c55e]" : ""],
              ["Errors", errorCount, errorCount > 0 ? "text-[#ef4444]" : ""],
              ["Total", queue.length, ""],
            ].map(([label, val, color]) => (
              <div key={label as string} className="bg-[#121214] rounded-lg p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b]">{label as string}</div>
                <div className={`text-xl font-bold text-white ${color as string}`}>{val as number}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            {step !== "script" && (
              <button className="btn btn-primary" onClick={handleGenerate} disabled={entriesInScript.length === 0}>
                <Terminal size={14} /> Generate Script ({entriesInScript.length})
              </button>
            )}
            {step !== "script" && (
              <button className="btn btn-ghost" onClick={prepareQueue} disabled={approvedProfiles.length === 0}>
                <Plus size={14} /> Add Approved ({approvedProfiles.length})
              </button>
            )}
            <button className="btn btn-ghost" onClick={clearQueue}>
              <Trash2 size={14} /> Clear All
            </button>
          </div>
        </div>
      )}

      {/* Generated Script Section */}
      {showScript && script && (
        <div className="card p-5 space-y-4 border border-[#22c55e]/20">
          <div className="flex items-start gap-3">
            <Terminal size={20} className="text-[#22c55e] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white mb-1">Step 2: Run Script in Instagram</h3>
              <ol className="text-xs text-[#a1a1aa] space-y-1 mb-3 list-decimal list-inside">
                <li>Go to <strong className="text-white">instagram.com</strong> and make sure you're logged in</li>
                <li>Open DevTools (<kbd className="kbd">F12</kbd> or <kbd className="kbd">Ctrl+Shift+I</kbd>)</li>
                <li>Click the <strong className="text-white">Console</strong> tab</li>
                <li>Paste the script below and press <kbd className="kbd">Enter</kbd></li>
                <li>Wait — it'll show progress in the console and update the page title</li>
                <li>When done, it <strong className="text-white">copies results to clipboard</strong> automatically</li>
              </ol>

              <div className="relative">
                <pre className="bg-[#0a0a0b] border border-[#27272a] rounded-lg p-4 text-xs font-mono text-[#a1a1aa] overflow-x-auto max-h-[400px] overflow-y-auto whitespace-pre-wrap break-all">
                  {script}
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute top-2 right-2 px-3 py-1.5 rounded-md text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition-colors flex items-center gap-1.5"
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? "Copied!" : "Copy Script"}
                </button>
              </div>

              <div className="text-xs text-[#52525b] mt-2 flex items-center gap-2">
                <AlertCircle size={12} />
                Leave the Instagram tab open while the script runs. It spreads unfollows over {CYCLE_HOURS} hours to avoid rate limits.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Paste Results Section */}
      {showScript && (
        <div className="card p-5 space-y-3">
          <div className="flex items-start gap-3">
            <ClipboardPaste size={20} className="text-[#eab308] shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-white mb-1">Step 3: Import Results</h3>
              <p className="text-xs text-[#a1a1aa] mb-3">
                After the script finishes and copies results to your clipboard, paste them here:
              </p>
              <textarea
                className="w-full h-24 input font-mono text-xs resize-none mb-3"
                placeholder="Paste the copied JSON here..."
                value={pasteInput}
                onChange={e => setPasteInput(e.target.value)}
              />
              <button
                className="btn btn-primary text-sm"
                onClick={handlePasteResults}
                disabled={!pasteInput.trim()}
              >
                <Play size={14} /> Import Results
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Queue Table */}
      {queue.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[#27272a]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#121214] border-b border-[#27272a]">
                <th className="text-left px-4 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">Username</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">Status</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">Details</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((entry) => (
                <tr key={entry.profileId} className="border-b border-[#27272a]/50 last:border-0 hover:bg-white/[0.015]">
                  <td className="px-4 py-3">
                    <span className="font-medium text-white">@{entry.username}</span>
                    {entry.fullName && <span className="text-[#52525b] ml-1.5 text-xs">{entry.fullName}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`badge ${
                      entry.status === "done" ? "badge-green" :
                      entry.status === "error" ? "badge-red" :
                      "badge-gray"
                    }`}>
                      {entry.status === "done" ? "✓ Unfollowed" :
                       entry.status === "error" ? "✕ Failed" :
                       "○ Queued"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#52525b] max-w-[300px] truncate">
                    {entry.error || (entry.unfollowedAt ? new Date(entry.unfollowedAt).toLocaleTimeString() : "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-center py-2 text-xs text-[#52525b]">
            {queue.length} account{queue.length !== 1 ? "s" : ""} · {doneCount} done · {errorCount} errors
          </div>
        </div>
      )}

      {/* Activity log */}
      {log.length > 0 && (
        <div className="card p-4 max-h-[200px] overflow-y-auto">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#52525b] mb-2">Activity Log</div>
          {log.map((msg, i) => (
            <div key={i} className="text-xs font-mono text-[#a1a1aa] py-0.5 leading-relaxed">{msg}</div>
          ))}
        </div>
      )}
    </div>
  )
}
