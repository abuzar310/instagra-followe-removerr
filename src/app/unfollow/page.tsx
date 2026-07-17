"use client"

import { useState, useEffect, useCallback } from "react"
import { getInstagramCookies, getUnfollowQueue, saveUnfollowQueue, clearUnfollowQueue, getFollowers } from "@/lib/store"
import type { InstagramCookies, Follower, UnfollowEntry, UnfollowStatus } from "@/lib/types"
import { UserMinus, Download, Trash2, AlertCircle, ArrowRight, CheckCircle, Copy, Check, Terminal } from "lucide-react"

export default function UnfollowPage() {
  const [profiles, setProfiles] = useState<Follower[]>([])
  const [queue, setQueue] = useState<UnfollowEntry[]>([])

  const refresh = useCallback(() => {
    setProfiles(getFollowers())
    setQueue(getUnfollowQueue())
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // APPROVED accounts = approved for unfollow (✅ in Review)
  const toRemoveProfiles = profiles.filter(p => p.approved === true)
  // REJECTED accounts = kept/whitelisted (❌ in Review = safe)
  const keptCount = profiles.filter(p => p.approved === false).length
  const pendingCount = profiles.filter(p => p.approved === null && !p.reviewed).length

  const doneCount = queue.filter(e => e.status === "done").length
  const errorCount = queue.filter(e => e.status === "error").length

  const [copied, setCopied] = useState(false)
  const [showScript, setShowScript] = useState(false)

  // Generate a ready-to-paste DevTools console script
  const generateConsoleScript = () => {
    const entries = toRemoveProfiles.map(p => ({ username: p.username }))
    const entriesJson = JSON.stringify(entries)
    return `// Instagram Unfollower — paste this entire thing in the Console tab on instagram.com

const ENTRIES = ${entriesJson};

(async function() {
  const TOTAL = ENTRIES.length;
  const CYCLE_HOURS = 36;
  const AVG_MS = (CYCLE_HOURS * 60 * 60 * 1000) / TOTAL;
  const baseWait = Math.max(60000, AVG_MS * 0.8);
  const jitter = Math.max(20000, AVG_MS * 0.4);
  let done = 0, errors = 0;

  console.log("🚀 Unfollowing " + TOTAL + " accounts over ~" + CYCLE_HOURS + " hours");
  console.log("");

  for (let i = 0; i < TOTAL; i++) {
    const e = ENTRIES[i];
    document.title = "Unfollow " + (i + 1) + "/" + TOTAL + " — Instagram";

    if (i > 0) {
      const delay = baseWait + Math.random() * jitter;
      const eta = new Date(Date.now() + (TOTAL - i) * (baseWait + jitter / 2));
      console.log("[" + (i + 1) + "/" + TOTAL + "] ⏳ " + Math.round(delay / 60000 * 10) / 10 + "min (ETA: " + eta.toLocaleTimeString() + ")");
      await new Promise(r => setTimeout(r, delay));
    }

    // Look up user ID via Instagram's web API (works while logged in)
    const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";
    let userId;
    try {
      const r = await fetch("https://www.instagram.com/api/v1/users/web_profile_info/?username=" + e.username, {
        headers: { "x-ig-app-id": "936619743392459", "x-csrftoken": csrf }
      });
      const d = await r.json();
      userId = d.data?.user?.id;
    } catch(_) {}

    if (!userId) {
      console.log("[" + (i + 1) + "/" + TOTAL + "] ❌ @" + e.username + " — not found (deleted?)");
      errors++;
      continue;
    }

    // Unfollow
    const res = await fetch("https://i.instagram.com/api/v1/friendships/destroy/" + userId + "/", {
      method: "POST",
      headers: { "x-ig-app-id": "936619743392459", "x-csrftoken": csrf, "content-type": "application/x-www-form-urlencoded" },
      body: ""
    });
    const d = await res.json();

    if (d.status === "ok") {
      console.log("[" + (i + 1) + "/" + TOTAL + "] ✅ @" + e.username + " — unfollowed");
      done++;
    } else {
      if (res.status === 429 || (d.message || "").includes("rate") || (d.message || "").includes("spam")) {
        console.log("[" + (i + 1) + "/" + TOTAL + "] ⏸ Rate limited — 3min pause...");
        await new Promise(r => setTimeout(r, 180000 + Math.random() * 60000));
        const r2 = await fetch("https://i.instagram.com/api/v1/friendships/destroy/" + userId + "/", {
          method: "POST",
          headers: { "x-ig-app-id": "936619743392459", "x-csrftoken": csrf, "content-type": "application/x-www-form-urlencoded" },
          body: ""
        });
        const d2 = await r2.json();
        if (d2.status === "ok") { console.log("[" + (i + 1) + "/" + TOTAL + "] ✅ @" + e.username + " — retry success"); done++; }
        else { console.log("[" + (i + 1) + "/" + TOTAL + "] ❌ @" + e.username + " — " + (d2.message || "failed")); errors++; }
      } else {
        console.log("[" + (i + 1) + "/" + TOTAL + "] ❌ @" + e.username + " — " + (d.message || "failed"));
        errors++;
      }
    }

    // Save progress to localStorage to resume if tab closes
    localStorage.setItem("ifr_unfollow_progress", JSON.stringify({ done, errors, lastIndex: i }));
  }

  console.log("");
  console.log("🎉 Done! " + done + " unfollowed, " + errors + " failed");
  localStorage.removeItem("ifr_unfollow_progress");
})();`
  }

  const copyConsoleScript = () => {
    const script = generateConsoleScript()
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    }).catch(() => {
      // Fallback: select text
      const el = document.getElementById("consoleScriptText") as HTMLTextAreaElement
      if (el) { el.select(); document.execCommand("copy") }
    })
  }

  // Export approved accounts as JSON for the extension's Unfollow tab
  const exportRejected = () => {
    // Extension needs profileId (IG pk) + username
    const data = toRemoveProfiles.map(p => ({
      profileId: p.id,
      username: p.username,
    }))
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "to-unfollow.json"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Mark as unfollowed in the queue
  const markDone = (id: string) => {
    const updated = queue.map(e =>
      e.profileId === id ? { ...e, status: "done" as UnfollowStatus, unfollowedAt: new Date().toISOString() } : e
    )
    saveUnfollowQueue(updated)
    setQueue(updated)
  }

  // Delete from queue
  const removeFromQueue = (id: string) => {
    const updated = queue.filter(e => e.profileId !== id)
    saveUnfollowQueue(updated)
    setQueue(updated)
  }

  const addToQueue = () => {
    const alreadyInQueue = new Set(queue.map(e => e.profileId))
    const newEntries: UnfollowEntry[] = toRemoveProfiles
      .filter(p => !alreadyInQueue.has(p.id))
      .map(p => ({
        profileId: p.id,
        username: p.username,
        fullName: p.full_name,
        status: "queued" as UnfollowStatus,
      }))
    const newQueue = [...queue, ...newEntries]
    saveUnfollowQueue(newQueue)
    setQueue(newQueue)
  }

  const clearAll = () => {
    clearUnfollowQueue()
    setQueue([])
  }

  const isEmpty = profiles.length === 0
  const hasNoneToRemove = toRemoveProfiles.length === 0

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <UserMinus size={48} className="text-[#27272a] mb-4" />
        <h2 className="text-lg font-semibold text-white/60 mb-2">No data imported</h2>
        <p className="text-sm text-[#52525b] max-w-sm mb-6">
          Import your follower data first, then review and reject bot accounts here.
        </p>
        <a href="/import" className="btn btn-primary">Import Data</a>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Remove Followers</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            {toRemoveProfiles.length > 0
              ? `${toRemoveProfiles.length} accounts approved for unfollow`
              : "Approve ✅ accounts in the Review page to add them here"}
          </p>
        </div>
        <a href="/review" className="btn btn-ghost text-sm">
          <ArrowRight size={14} /> Go to Review
        </a>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#ef4444] mb-1">To Remove</div>
          <div className="text-2xl font-bold text-white">{toRemoveProfiles.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#22c55e] mb-1">Kept (Safe) ✓</div>
          <div className="text-2xl font-bold text-white">{keptCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#eab308] mb-1">Still to Review</div>
          <div className="text-2xl font-bold text-white">{pendingCount}</div>
        </div>
        <div className="card p-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b] mb-1">Total</div>
          <div className="text-2xl font-bold text-white">{profiles.length}</div>
        </div>
      </div>

      {/* Main action card */}
      <div className="card p-6">
        <div className="flex items-start gap-4 flex-wrap md:flex-nowrap">
          <div className="w-12 h-12 rounded-xl bg-[rgba(239,68,68,0.1)] flex items-center justify-center shrink-0">
            <UserMinus size={24} className="text-[#ef4444]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-white mb-1">
              {hasNoneToRemove
                ? "No accounts to remove yet"
                : `${toRemoveProfiles.length} bot${toRemoveProfiles.length !== 1 ? "s" : ""} ready to remove`}
            </h2>
            <p className="text-sm text-[#a1a1aa] mb-4">
              {hasNoneToRemove
                ? "Go to the Review page, click on accounts, and press ❌ Reject to mark them as bots. Then come back here to remove them."
                : "Download the list of rejected accounts and run the unfollow script on your computer. It'll open Brave and remove them slowly (like a human)."}
            </p>

            {!hasNoneToRemove && (
              <div className="flex gap-2 flex-wrap">
                <button className="btn btn-danger" onClick={exportRejected}>
                  <Download size={14} /> Download List to Unfollow
                </button>
                <button className="btn btn-ghost" onClick={addToQueue}>
                  Add to Queue
                </button>
                {queue.length > 0 && (
                  <button className="btn btn-ghost" onClick={clearAll}>
                    <Trash2 size={14} /> Clear Queue
                  </button>
                )}
              </div>
            )}

            {hasNoneToRemove && (
              <a href="/review" className="btn btn-primary">
                <ArrowRight size={14} /> Review Accounts Now
              </a>
            )}
          </div>
        </div>
      </div>

      {/* How to unfollow instructions */}
      {!hasNoneToRemove && (
        <div className="card p-5 space-y-3 border border-[#ef4444]/20">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-[#ef4444]" />
            <h3 className="text-sm font-semibold text-white">How to remove these accounts</h3>
          </div>
          <ol className="text-sm text-[#a1a1aa] space-y-2 ml-5 list-decimal">
            <li>
              Click <strong className="text-white">"Download List to Unfollow"</strong> above — it saves a file called <code className="text-xs bg-[#1f1f23] px-1.5 py-0.5 rounded text-white/60">to-unfollow.json</code>
            </li>
            <li>
              Open a terminal and run:
              <pre className="bg-[#0a0a0b] border border-[#27272a] rounded-lg p-3 text-xs font-mono text-[#a1a1aa] mt-1 overflow-x-auto">
node scripts/unfollow-instagram.mjs to-unfollow.json
              </pre>
            </li>
            <li>
              Your Brave browser will open and unfollow all the bots — it takes 5-10 seconds per account so Instagram doesn't block you
            </li>
            <li>
              After it finishes, <strong className="text-white">come back here</strong> and check them off
            </li>
          </ol>
        </div>
      )}

      {/* Queue Table */}
      {queue.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">Progress</h3>
          <div className="overflow-x-auto rounded-xl border border-[#27272a]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#121214] border-b border-[#27272a]">
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">Username</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3" />
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
                        entry.status === "error" ? "badge-red" : "badge-gray"
                      }`}>
                        {entry.status === "done" ? "✓ Removed" :
                         entry.status === "error" ? "✕ Failed" : "○ Queued"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.status === "done" ? (
                        <span className="text-xs text-[#52525b]">
                          {entry.unfollowedAt ? new Date(entry.unfollowedAt).toLocaleTimeString() : ""}
                        </span>
                      ) : (
                        <button className="btn btn-ghost btn-sm p-1" onClick={() => markDone(entry.profileId)} title="Mark as done">
                          <CheckCircle size={14} className="text-[#22c55e]" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-center py-2 text-xs text-[#52525b]">
              {queue.length} total · {doneCount} removed · {errorCount} errors
            </div>
          </div>
        </div>
      )}

      {/* Whitelisted accounts summary */}
      {keptCount > 0 && (
        <div className="bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.15)] rounded-xl p-4">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="text-[#22c55e]" />
            <p className="text-sm text-[#22c55e]">
              <strong>{keptCount}</strong> account{keptCount !== 1 ? "s" : ""} whitelisted — they won't be removed
            </p>
          </div>
        </div>
      )}

      {/* Help for beginners */}
      <details className="card p-4">
        <summary className="text-sm font-medium text-[#a1a1aa] cursor-pointer hover:text-white transition-colors">
          🤔 How does this work? (click to expand)
        </summary>
        <div className="mt-3 text-sm text-[#52525b] space-y-2">
          <p><strong className="text-white">Step 1:</strong> Go to <strong className="text-white">Review</strong> page</p>
          <p><strong className="text-white">Step 2:</strong> Click each account → press ✅ Approve (real people) or ❌ Reject (bots)</p>
          <p><strong className="text-white">Step 3:</strong> Come back here → click "Download List to Unfollow"</p>
          <p><strong className="text-white">Step 4:</strong> Run the script in your terminal → boom, bots gone! 🚀</p>
          <p className="pt-2 text-[#a1a1aa]">✅ Approved accounts = whitelisted (kept) · ❌ Rejected = removed</p>
        </div>
      </details>
    </div>
  )
}
