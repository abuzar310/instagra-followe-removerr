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

  // Generate a ready-to-paste DevTools console script
  const generateConsoleScript = () => {
    const entries = toRemoveProfiles.map(p => ({ username: p.username }))
    const entriesJson = JSON.stringify(entries)
    return `// 🔥 Instagram Unfollower — Smart Batch Mode (targets ~24h)
// Paste this in Instagram's Console tab (F12) while logged in

const ENTRIES = ${entriesJson};

(async function() {
  const TOTAL = ENTRIES.length;
  const MAX_HOURS = 24;
  const DEADLINE = Date.now() + MAX_HOURS * 3600000;
  const START_TIME = Date.now();
  console.log("");
  console.log("🔥 Instagram Unfollower — Smart Batch Mode");
  console.log("🎯 " + TOTAL + " accounts to unfollow, targeting ~" + MAX_HOURS + " hours");
  console.log("⏰ Deadline: " + new Date(DEADLINE).toLocaleString());
  console.log("");

  // Resume from saved progress
  let saved;
  try { saved = JSON.parse(localStorage.getItem("ifr_unfollow_progress") || "null"); } catch {}
  let startIndex = saved ? (saved.lastIndex + 1) : 0;
  let done = saved?.done || 0;
  let errors = saved?.errors || 0;
  let batchCount = saved?.batch || 0;
  let cumulativeWorkMs = 0;

  if (saved) {
    console.log("📋 Resuming from " + (saved.lastIndex + 1) + "/" + TOTAL + " (" + done + " done, " + errors + " errors)");
    console.log("");
  }

  for (let i = startIndex; i < TOTAL; i++) {
    const username = ENTRIES[i].username;

    // Start a new batch every so often
    const batchStart = (i - startIndex) % (5 + Math.floor(Math.random() * 11)) === 0; // 5-15 per batch
    if (batchStart && i > startIndex) {
      batchCount++;
      const elapsed = Date.now() - START_TIME;
      const remaining = TOTAL - i;
      const timeLeft = DEADLINE - Date.now();
      const avgWorkPerAccount = cumulativeWorkMs / Math.max(1, i - startIndex);
      const estimatedWorkMs = remaining * avgWorkPerAccount;
      const restBudget = Math.max(0, timeLeft - estimatedWorkMs);
      const estimatedRests = Math.max(1, Math.ceil(remaining / 10));

      let restMs;
      if (restBudget > 0) {
        restMs = restBudget / estimatedRests;
        restMs = Math.max(180000, Math.min(restMs, 2400000)); // 3-40 min
      } else {
        restMs = 120000; // running behind, 2 min
      }

      const restMinutes = Math.round(restMs / 60000 * 10) / 10;
      const eta = new Date(Date.now() + estimatedWorkMs + Math.max(0, restBudget));
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("😴 Batch #" + batchCount + " done — Resting " + restMinutes + "min (ETA: " + eta.toLocaleTimeString() + ")");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Sleep with ETA ticker
      const sleepStart = Date.now();
      while (Date.now() - sleepStart < restMs) {
        const left = Math.round((restMs - (Date.now() - sleepStart)) / 1000);
        const mins = Math.floor(left / 60);
        const secs = left % 60;
        document.title = "😴 Rest " + mins + "m " + secs + "s — " + (TOTAL - i) + " left";
        await new Promise(r => setTimeout(r, 5000));
      }
      document.title = "Unfollow — Batch #" + (batchCount + 1);
    }

    // Small random gap between accounts (5-13s)
    if (i > startIndex) {
      const gap = 5000 + Math.random() * 8000;
      await new Promise(r => setTimeout(r, gap));
    }

    const accountStart = Date.now();
    document.title = "🔍 @" + username + " (" + (i + 1) + "/" + TOTAL + ")";

    // Get CSRF token
    const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";

    // Look up user ID
    let userId;
    try {
      const r = await fetch("https://www.instagram.com/api/v1/users/web_profile_info/?username=" + username, {
        credentials: "include",
        headers: { "x-ig-app-id": "936619743392459", "x-csrftoken": csrf }
      });
      const d = await r.json();
      userId = d.data?.user?.id;
    } catch {}

    if (!userId) {
      console.log("[" + (i + 1) + "/" + TOTAL + "] ❌ @" + username + " — not found");
      errors++;
      localStorage.setItem("ifr_unfollow_progress", JSON.stringify({ done, errors, lastIndex: i, batch: batchCount }));
      continue;
    }

    // Unfollow via API
    let success = false;
    for (let attempt = 0; attempt < 2 && !success; attempt++) {
      try {
        const res = await fetch("https://i.instagram.com/api/v1/friendships/destroy/" + userId + "/", {
          method: "POST",
          credentials: "include",
          headers: {
            "x-ig-app-id": "936619743392459",
            "x-csrftoken": csrf,
            "content-type": "application/x-www-form-urlencoded"
          },
          body: ""
        });
        const d = await res.json();

        if (d.status === "ok") {
          console.log("[" + (i + 1) + "/" + TOTAL + "] ✅ @" + username + " — unfollowed");
          done++;
          success = true;
        } else if (res.status === 429 || (d.message || "").includes("rate") || (d.message || "").includes("spam")) {
          console.log("[" + (i + 1) + "/" + TOTAL + "] ⏸ Rate limited — 3min pause...");
          await new Promise(r => setTimeout(r, 180000 + Math.random() * 60000));
        } else if (d.spam) {
          console.log("[" + (i + 1) + "/" + TOTAL + "] ⏸ Spam check — 5min pause...");
          await new Promise(r => setTimeout(r, 300000 + Math.random() * 120000));
        } else {
          console.log("[" + (i + 1) + "/" + TOTAL + "] ❌ @" + username + " — " + (d.message || "failed"));
          errors++;
          success = true; // counted
        }
      } catch (e) {
        console.log("[" + (i + 1) + "/" + TOTAL + "] ❌ @" + username + " — network error: " + e.message);
        if (attempt === 0) {
          console.log("   Retrying in 30s...");
          await new Promise(r => setTimeout(r, 30000));
        } else {
          errors++;
          success = true;
        }
      }
    }

    cumulativeWorkMs += Date.now() - accountStart;

    // Save progress every account
    localStorage.setItem("ifr_unfollow_progress", JSON.stringify({ done, errors, lastIndex: i, batch: batchCount }));

    // Show pace every 10 accounts
    if ((i + 1) % 10 === 0) {
      const elapsedHrs = (Date.now() - START_TIME) / 3600000;
      const rate = (i - startIndex + 1) / elapsedHrs;
      const remaining = TOTAL - (i + 1);
      const estHrs = (remaining / rate) || 0;
      console.log("📊 " + (i + 1) + "/" + TOTAL + " — " + Math.round(rate) + "/hr — est " + Math.round(estHrs * 10) / 10 + "h remaining");
    }
  }

  console.log("");
  console.log("🎉 Done! " + done + " unfollowed, " + errors + " failed");
  console.log("⏱ Took " + Math.round((Date.now() - START_TIME) / 3600000 * 10) / 10 + " hours");
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

            {!hasNoneToRemove ? (
              <div className="flex gap-2 flex-wrap">
                <button className="btn btn-danger" onClick={exportRejected}>
                  <Download size={14} /> Download List to Unfollow
                </button>
                <button className="btn btn-primary" onClick={copyConsoleScript}>
                  {copied ? <Check size={14} /> : <Terminal size={14} />}
                  {copied ? "Copied!" : "Copy Console Script"}
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
            ) : (
              <a href="/review" className="btn btn-primary">
                <ArrowRight size={14} /> Review Accounts Now
              </a>
            )}

            {!hasNoneToRemove && (
              <div className="flex items-center gap-2 pt-2 border-t border-[#27272a]/50 text-xs text-[#52525b]">
                <span>🎯 Targets ~24h — random bursts of 5-15 accounts with adaptive rests</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* How to unfollow instructions */}
      {!hasNoneToRemove && (
        <div className="card p-5 space-y-4 border border-[#ef4444]/20">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-[#ef4444]" />
            <h3 className="text-sm font-semibold text-white">How to remove these accounts</h3>
          </div>

          {/* Method A: DevTools Console Script */}
          <div className="bg-[#121214] rounded-xl p-4 border border-[#27272a]">
            <div className="flex items-center gap-2 mb-2">
              <Terminal size={14} className="text-[#818cf8]" />
              <span className="text-sm font-medium text-white">Method A: Run in your browser (recommended)</span>
            </div>
            <ol className="text-sm text-[#a1a1aa] space-y-2 ml-5 list-decimal">
              <li>
                Click <strong className="text-white">"Copy Console Script"</strong> above
              </li>
              <li>
                Go to <strong className="text-white">instagram.com</strong> in your browser (make sure you're logged in)
              </li>
              <li>
                Open DevTools (<strong className="text-white">F12</strong>) → <strong className="text-white">Console</strong> tab
              </li>
              <li>
                Paste the script into the console and press <strong className="text-white">Enter</strong>
              </li>
              <li>
                Wait — it unfollows in random bursts of 5-15 accounts, 5-13s apart, with short rests in between. <span className="text-[#eab308]">Keep the tab open</span>
              </li>
            </ol>
            <div className="mt-2 text-xs text-[#52525b]">
              💡 Script saves progress to localStorage — safe to close and resume later
            </div>
          </div>

          {/* Method B: Playwright script (old) */}
          <div className="bg-[#121214] rounded-xl p-4 border border-[#27272a]">
            <div className="flex items-center gap-2 mb-2">
              <Terminal size={14} className="text-[#22c55e]" />
              <span className="text-sm font-medium text-white">Method B: Playwright automation (advanced)</span>
            </div>
            <ol className="text-sm text-[#a1a1aa] space-y-2 ml-5 list-decimal">
              <li>
                Click <strong className="text-white">"Download List to Unfollow"</strong> above — saves <code className="text-xs bg-[#1f1f23] px-1.5 py-0.5 rounded text-white/60">to-unfollow.json</code>
              </li>
              <li>
                Open a terminal and run:
                <pre className="bg-[#0a0a0b] border border-[#27272a] rounded-lg p-3 text-xs font-mono text-[#a1a1aa] mt-1 overflow-x-auto">
node scripts/unfollow-instagram.mjs to-unfollow.json
                </pre>
              </li>
              <li>
                Your Brave browser will open and unfollow bots slowly
              </li>
            </ol>
          </div>

          <div className="text-xs text-[#52525b]">
            After either method finishes, <strong className="text-white">come back here</strong> and check them off below
          </div>
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
