"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { generateScraperScript } from "@/lib/ig-scraper-script"
import {
  getFollowers, saveInstagramCookies, getInstagramCookies,
  clearInstagramCookies,
} from "@/lib/store"
import type { InstagramCookies, Follower } from "@/lib/types"
import { v4 as uuid } from "uuid"
import { Terminal, Copy, Check, AlertCircle, ArrowRight, ChevronDown, ChevronUp, ExternalLink, LogIn, Users } from "lucide-react"

type Step = "script" | "paste" | "done"

export default function ConnectPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("script")
  const [jsonInput, setJsonInput] = useState("")
  const [copied, setCopied] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<{
    followersCount: number
    followingCount: number
  } | null>(null)
  const [showCookieTab, setShowCookieTab] = useState(false)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  const script = generateScraperScript()

  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(script)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      // Fallback: select the textarea content
      if (pasteRef.current) {
        pasteRef.current.select()
      }
    }
  }

  const handlePasteData = async () => {
    setError("")
    setImporting(true)

    const text = jsonInput.trim()
    if (!text) {
      setError("Paste the data first, then click Import.")
      setImporting(false)
      return
    }

    let data: any
    try {
      data = JSON.parse(text)
    } catch {
      setError("Invalid JSON. Make sure you copied the full output from the script.")
      setImporting(false)
      return
    }

    if (!data.followers && !data.following) {
      setError("This doesn't look like Instagram data. Make sure you ran the script correctly on instagram.com")
      setImporting(false)
      return
    }

    const followers = data.followers || []
    const following = data.following || []

    if (followers.length === 0 && following.length === 0) {
      setError("Instagram returned 0 results. Make sure you're logged in and try again.")
      setImporting(false)
      return
    }

    // Find non-followbacks
    const followerIds = new Set(followers.map((u: any) => String(u.pk || u.id)))
    const nonFollowbacks = following.filter((u: any) => !followerIds.has(String(u.pk || u.id)))
    const targetProfiles = nonFollowbacks.length > 0 ? nonFollowbacks : following

    // Convert to our Follower format and score
    const rules = await import("@/lib/store").then(m => m.getRules())
    const { scoreFollower } = await import("@/lib/store")
    const batchId = uuid()
    const now = new Date().toISOString()

    const mapped: Follower[] = targetProfiles.map((u: any) => {
      const f: Follower = {
        id: String(u.pk || uuid()),
        username: u.username || "",
        full_name: u.full_name || "",
        biography: u.biography || "",
        followers_count: u.follower_count ?? u.followers ?? 0,
        following_count: u.following_count ?? u.following ?? 0,
        posts_count: u.media_count ?? u.posts ?? 0,
        is_private: !!u.is_private,
        is_verified: !!u.is_verified,
        has_profile_pic: !!(u.profile_pic_url && u.profile_pic_url.length > 5),
        profile_pic_url: u.profile_pic_url || "",
        account_age_days: null,
        external_url: u.external_url || null,
        is_business: !!u.is_business,
        email: u.email || null,
        phone: u.phone || null,
        suspicion_score: 0,
        suspicion_reasons: [],
        reviewed: false,
        approved: null,
        notes: "",
        created_at: now,
        import_batch: batchId,
      }

      const { score, reasons } = scoreFollower(f, rules)
      f.suspicion_score = score
      f.suspicion_reasons = reasons
      return f
    })

    // Save to localStorage
    const existing = getFollowers()
    localStorage.setItem("ifr_followers", JSON.stringify([...mapped, ...existing]))

    // Save import batch
    const batches = JSON.parse(localStorage.getItem("ifr_batches") || "[]")
    batches.unshift({
      id: batchId,
      filename: "instagram-connect",
      count: mapped.length,
      created_at: now,
    })
    localStorage.setItem("ifr_batches", JSON.stringify(batches))

    const flagged = mapped.filter(f => f.suspicion_score >= 30).length

    setResult({
      followersCount: followers.length,
      followingCount: following.length,
    })
    setStep("done")
    setImporting(false)
  }

  const goToReview = () => {
    router.push("/review")
  }

  const flaggedCount = result
    ? (() => {
        const all = getFollowers()
        return all.filter(f => f.suspicion_score >= 30).length
      })()
    : 0

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Connect Instagram</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            Run a script in Instagram's DevTools to fetch your data — no cookies, no servers.
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] rounded-xl p-4 text-sm text-[#ef4444] whitespace-pre-wrap">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Step progress */}
      <div className="flex gap-2 items-center text-sm">
        {[
          { key: "script", label: "Copy Script" },
          { key: "paste", label: "Run & Paste" },
          { key: "done", label: "Review" },
        ].map((s, i) => {
          const idx = ["script", "paste", "done"].indexOf(s.key)
          const curIdx = ["script", "paste", "done"].indexOf(step)
          const done = curIdx > idx
          const active = curIdx === idx
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className="w-6 h-px bg-[#27272a]" />}
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                  done
                    ? "bg-[rgba(34,197,94,0.1)] text-[#22c55e]"
                    : active
                    ? "bg-[rgba(99,102,241,0.1)] text-[#818cf8]"
                    : "bg-[#121214] text-[#52525b]"
                }`}
              >
                {done ? "✓" : active ? "●" : `${i + 1}`} {s.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* ════ STEP 1: Copy Script ════ */}
      {step === "script" && (
        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="text-base font-semibold text-white mb-1">Step 1: Copy the script</h3>
            <p className="text-sm text-[#a1a1aa] mb-4">
              This script fetches your followers and following using your live Instagram session.
            </p>

            {/* Instructions */}
            <div className="bg-[#121214] rounded-xl p-4 mb-4 space-y-2 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.1)] text-[#818cf8] flex items-center justify-center text-xs font-bold shrink-0">1</div>
                <div>
                  <span className="text-white">Copy the script</span>
                  <span className="text-[#a1a1aa]"> using the button below</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.1)] text-[#818cf8] flex items-center justify-center text-xs font-bold shrink-0">2</div>
                <div>
                  <span className="text-white">Go to instagram.com</span>
                  <span className="text-[#a1a1aa]"> in your browser (make sure you're logged in)</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.1)] text-[#818cf8] flex items-center justify-center text-xs font-bold shrink-0">3</div>
                <div>
                  <span className="text-white">Open DevTools</span>
                  <span className="text-[#a1a1aa]"> (F12 or right-click → Inspect) → Console tab</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.1)] text-[#818cf8] flex items-center justify-center text-xs font-bold shrink-0">4</div>
                <div>
                  <span className="text-white">Paste the script</span>
                  <span className="text-[#a1a1aa]"> in the console and press Enter</span>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.1)] text-[#818cf8] flex items-center justify-center text-xs font-bold shrink-0">5</div>
                <div>
                  <span className="text-[#22c55e]">Wait for "📋 COPIED TO CLIPBOARD!"</span>
                  <span className="text-[#a1a1aa]"> — then come back here and paste</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                className={`btn ${copied ? 'bg-[#22c55e] text-white' : 'btn-primary'}`}
                onClick={handleCopyScript}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied!" : "Copy Script to Clipboard"}
              </button>
              <button className="btn btn-ghost" onClick={() => setStep("paste")}>
                I already have the data <ArrowRight size={14} />
              </button>
            </div>
          </div>

          {/* Script preview (collapsible) */}
          <details className="card p-4">
            <summary className="text-sm font-medium text-[#a1a1aa] cursor-pointer flex items-center gap-2">
              <Terminal size={14} />
              Show script (advanced)
            </summary>
            <pre className="mt-3 p-3 bg-[#0a0a0b] rounded-lg text-xs text-[#a1a1aa] overflow-x-auto max-h-[300px] overflow-y-auto font-mono leading-relaxed">
              {script}
            </pre>
          </details>

          {/* Troubleshooting */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white/80 mb-2">Troubleshooting</h3>
            <ul className="text-sm text-[#a1a1aa] space-y-1.5 leading-relaxed">
              <li>• <strong>Can't paste in console?</strong> Type <code className="text-xs bg-[#1f1f23] px-1.5 py-0.5 rounded text-white/60">allow pasting</code> and press Enter, then paste again</li>
              <li>• <strong>Script takes long?</strong> It paginates through all your followers — may take 30-60 seconds if you have many</li>
              <li>• <strong>Nothing copied?</strong> The script will log the output. Right-click it and Copy, then paste here</li>
              <li>• <strong>Still not working?</strong> Make sure you're on <strong>instagram.com</strong> and logged in</li>
              <li>• <strong>"Could not establish connection. Receiving end does not exist"?</strong> That's a Cookie-Editor extension error — reload the instagram.com tab (F5) after installing it, or skip the extension entirely and use this script method instead</li>
            </ul>
          </div>
        </div>
      )}

      {/* ════ STEP 2: Paste Data ════ */}
      {step === "paste" && (
        <div className="space-y-4">
          <div className="card p-6">
            <h3 className="text-base font-semibold text-white mb-1">Step 2: Paste the data</h3>
            <p className="text-sm text-[#a1a1aa] mb-4">
              Ran the script on Instagram? Great — now paste the JSON here.
            </p>

            <textarea
              ref={pasteRef}
              placeholder="Paste the Instagram data here (Ctrl+V)..."
              value={jsonInput}
              onChange={e => setJsonInput(e.target.value)}
              className="input w-full min-h-[200px] resize-y font-mono text-sm"
            />
            <div className="flex items-center gap-3 mt-3">
              <button
                className="btn btn-primary"
                onClick={handlePasteData}
                disabled={importing || !jsonInput.trim()}
              >
                {importing ? "Importing..." : "Import & Analyze"}
              </button>
              <button className="btn btn-ghost text-sm" onClick={() => setStep("script")}>
                ← Back to script
              </button>
            </div>
            {jsonInput.trim() && (
              <p className="text-xs text-[#52525b] mt-2">
                ~{Math.round(jsonInput.length / 1024)} KB pasted
              </p>
            )}
          </div>

          {/* Cookie method toggle */}
          <div className="card p-4">
            <button
              className="flex items-center justify-between w-full text-sm text-[#a1a1aa]"
              onClick={() => setShowCookieTab(!showCookieTab)}
            >
              <span>Using Cookie-Editor extension instead?</span>
              {showCookieTab ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
            {showCookieTab && (
              <div className="mt-4 pt-4 border-t border-[#27272a] space-y-3">
                <p className="text-sm text-[#a1a1aa]">
                  If you prefer the old method: install <strong>Cookie-Editor</strong> Chrome extension,
                  go to instagram.com, click the extension → <strong>Export → JSON</strong>,
                  then paste below.
                </p>
                <textarea
                  placeholder='[{"name":"sessionid","value":"..."}, ...]'
                  className="input w-full min-h-[60px] font-mono text-sm"
                />
                <p className="text-xs text-[#eab308]">
                  Note: Cookie method may not work reliably on all systems. The DevTools script above is recommended.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ STEP 3: Done ════ */}
      {step === "done" && result && (
        <div className="card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[rgba(34,197,94,0.1)] flex items-center justify-center mx-auto mb-4">
            <Users size={32} className="text-[#22c55e]" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Data Imported!</h3>
          <p className="text-sm text-[#a1a1aa] mb-6">
            Fetched <strong>{result.followersCount}</strong> followers and{" "}
            <strong>{result.followingCount}</strong> following —{" "}
            <strong>{flaggedCount}</strong> flagged as suspicious
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button className="btn btn-primary" onClick={goToReview}>
              Review Queue ({flaggedCount} flagged)
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setStep("script")
                setJsonInput("")
                setResult(null)
              }}
            >
              Import another
            </button>
          </div>
        </div>
      )}

      {/* Info card */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white/80 mb-2">🔒 How it works</h3>
        <ul className="text-sm text-[#a1a1aa] space-y-1.5 leading-relaxed">
          <li>• The script runs INSIDE your browser on instagram.com — using YOUR live login session</li>
          <li>• Instagram sees a normal API request from your browser — no blocks, no detection</li>
          <li>• Data goes from Instagram → your clipboard → this app</li>
          <li>• Nothing is stored on any server — all data stays in your browser's localStorage</li>
          <li>• After importing, you just review accounts and (optionally) unfollow</li>
        </ul>
      </div>
    </div>
  )
}
