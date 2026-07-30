"use client"

import { useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { generateScraperScript } from "@/lib/ig-scraper-script"
import {
  getFollowers, getWhitelist,
} from "@/lib/store"
import type { Follower } from "@/lib/types"
import { v4 as uuid } from "uuid"
import {
  Terminal, Copy, Check, AlertCircle, ArrowRight,
  ChevronDown, ChevronUp, Zap, LogIn, Users, Loader2,
  Play, StopCircle,
} from "lucide-react"

type Method = "quick" | "manual" | "script"
type ScriptStep = "script" | "paste" | "done"
type ConnectStatus = "idle" | "auth" | "fetch" | "import" | "done" | "error"

export default function ConnectPage() {
  const router = useRouter()
  const [method, setMethod] = useState<Method>("quick")

  // ── DevTools script state ──
  const [scriptStep, setScriptStep] = useState<ScriptStep>("script")
  const [jsonInput, setJsonInput] = useState("")
  const [copied, setCopied] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState("")
  const [showCookieTab, setShowCookieTab] = useState(false)
  const pasteRef = useRef<HTMLTextAreaElement>(null)

  // ── Quick / Manual login state ──
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>("idle")
  const [logs, setLogs] = useState<string[]>([])
  const [fetchProgress, setFetchProgress] = useState({ phase: "", count: 0 })
  const [result, setResult] = useState<{
    followersCount: number
    followingCount: number
    skippedWhitelisted: number
  } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const script = generateScraperScript()

  // ── Clear ──
  const resetAll = () => {
    if (abortRef.current) abortRef.current.abort()
    setConnectStatus("idle")
    setLogs([])
    setFetchProgress({ phase: "", count: 0 })
    setError("")
  }

  // ── Read SSE stream ──
  const readStream = async (response: Response, onEvent: (type: string, data: any) => void) => {
    const reader = response.body?.getReader()
    if (!reader) return
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
        let type = "", data = ""
        for (const line of lines) {
          if (line.startsWith("event: ")) type = line.slice(7)
          if (line.startsWith("data: ")) data = line.slice(6)
        }
        if (data) {
          try { onEvent(type, JSON.parse(data)) } catch {}
        }
      }
    }
  }

  // ── Start auth + fetch + import ──
  const handleConnect = async (loginMethod: "quick" | "manual") => {
    resetAll()
    setConnectStatus("auth")
    setError("")

    const abort = new AbortController()
    abortRef.current = abort

    try {
      // Step 1: Auth
      setLogs(["🔄 Starting authentication..."])
      const authBody: any = { method: loginMethod }
      if (loginMethod === "manual") {
        authBody.username = username
        authBody.password = password
      }

      let cookies: any = null
      let myUsername = ""

      const authRes = await fetch("/api/instagram/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(authBody),
        signal: abort.signal,
      })

      if (!authRes.ok) {
        setError(`Auth failed: HTTP ${authRes.status}`)
        setConnectStatus("error")
        return
      }

      await readStream(authRes, (type, data) => {
        if (type === "log") {
          setLogs((prev) => [...prev.slice(-50), data.text])
        } else if (type === "cookies") {
          cookies = data
          myUsername = data.username
          setLogs((prev) => [...prev, `✅ Authenticated as @${myUsername}`])
        } else if (type === "error") {
          setError(data.message)
          setConnectStatus("error")
        }
      })

      if (!cookies) {
        setError("Authentication failed — no session received. Instagram may have blocked the request or the browser closed too quickly.")
        setConnectStatus("error")
        setLogs((prev) => [...prev, "❌ Authentication stream ended without receiving session cookies."])
        return
      }

      // Step 2: Fetch followers/following
      setConnectStatus("fetch")
      setLogs((prev) => [...prev, "📡 Fetching followers & following..."])

      const fetchRes = await fetch("/api/instagram/fetch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cookies }),
        signal: abort.signal,
      })

      if (!fetchRes.ok) {
        setError(`Fetch failed: HTTP ${fetchRes.status}`)
        setConnectStatus("error")
        return
      }

      let fetchData: any = null

      await readStream(fetchRes, (type, data) => {
        if (type === "log") {
          setLogs((prev) => [...prev.slice(-50), data.text])
        } else if (type === "progress") {
          setFetchProgress({ phase: data.phase, count: data.count })
        } else if (type === "done") {
          fetchData = data
        } else if (type === "error") {
          setError(data.message)
          setConnectStatus("error")
        }
      })

      if (!fetchData) return

      // Step 3: Import
      setConnectStatus("import")
      setLogs((prev) => [...prev, "📦 Importing data..."])

      const followers = fetchData.followers || []
      const following = fetchData.following || []

      if (followers.length === 0 && following.length === 0) {
        setError("Instagram returned 0 results. Your session may have expired.")
        setConnectStatus("error")
        return
      }

      // Process & import same as the DevTools flow
      const followerIds = new Set(followers.map((u: any) => String(u.pk || u.id)))
      const nonFollowbacks = following.filter((u: any) => !followerIds.has(String(u.pk || u.id)))
      let targetProfiles = nonFollowbacks.length > 0 ? nonFollowbacks : following

      const whitelist = getWhitelist()
      const wlIds = new Set(whitelist.map(w => w.id))
      const wlUsernames = new Set(whitelist.map(w => w.username.toLowerCase()))
      const beforeWl = targetProfiles.length
      targetProfiles = targetProfiles.filter((u: any) => {
        const id = String(u.pk || u.id || "")
        const username = String(u.username || "").toLowerCase()
        return !wlIds.has(id) && !wlUsernames.has(username)
      })
      const skippedWhitelisted = beforeWl - targetProfiles.length

      const existingIds = new Set(getFollowers().map(f => f.id))
      targetProfiles = targetProfiles.filter((u: any) => !existingIds.has(String(u.pk || u.id || "")))

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

      const existing = getFollowers()
      localStorage.setItem("ifr_followers", JSON.stringify([...mapped, ...existing]))
      const batches = JSON.parse(localStorage.getItem("ifr_batches") || "[]")
      batches.unshift({ id: batchId, filename: `instagram-${loginMethod}`, count: mapped.length, created_at: now })
      localStorage.setItem("ifr_batches", JSON.stringify(batches))

      setResult({ followersCount: followers.length, followingCount: following.length, skippedWhitelisted })
      setConnectStatus("done")
      setLogs((prev) => [...prev, `✅ Done! ${mapped.length} new profiles imported.`])
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setError(err.message || "Connection failed")
        setConnectStatus("error")
      }
    }
  }

  // ── DevTools handlers ──
  const handleCopyScript = async () => {
    try {
      await navigator.clipboard.writeText(script)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      if (pasteRef.current) pasteRef.current.select()
    }
  }

  const handlePasteData = async () => {
    setError("")
    setImporting(true)
    const text = jsonInput.trim()
    if (!text) { setError("Paste the data first."); setImporting(false); return }

    let data: any
    try { data = JSON.parse(text) } catch { setError("Invalid JSON."); setImporting(false); return }
    if (!data.followers && !data.following) { setError("Not Instagram data."); setImporting(false); return }

    const followers = data.followers || []
    const following = data.following || []
    if (followers.length === 0 && following.length === 0) { setError("0 results."); setImporting(false); return }

    const followerIds = new Set(followers.map((u: any) => String(u.pk || u.id)))
    const nonFollowbacks = following.filter((u: any) => !followerIds.has(String(u.pk || u.id)))
    let targetProfiles = nonFollowbacks.length > 0 ? nonFollowbacks : following

    const whitelist = getWhitelist()
    const wlIds = new Set(whitelist.map(w => w.id))
    const wlUsernames = new Set(whitelist.map(w => w.username.toLowerCase()))
    const beforeWl = targetProfiles.length
    targetProfiles = targetProfiles.filter((u: any) => {
      const id = String(u.pk || u.id || "")
      const username = String(u.username || "").toLowerCase()
      return !wlIds.has(id) && !wlUsernames.has(username)
    })
    const skippedWhitelisted = beforeWl - targetProfiles.length

    const existingIds = new Set(getFollowers().map(f => f.id))
    targetProfiles = targetProfiles.filter((u: any) => !existingIds.has(String(u.pk || u.id || "")))

    const rules = await import("@/lib/store").then(m => m.getRules())
    const { scoreFollower } = await import("@/lib/store")
    const batchId = uuid()
    const now = new Date().toISOString()

    const mapped: Follower[] = targetProfiles.map((u: any) => {
      const f: Follower = {
        id: String(u.pk || uuid()), username: u.username || "", full_name: u.full_name || "",
        biography: u.biography || "", followers_count: u.follower_count ?? u.followers ?? 0,
        following_count: u.following_count ?? u.following ?? 0, posts_count: u.media_count ?? u.posts ?? 0,
        is_private: !!u.is_private, is_verified: !!u.is_verified,
        has_profile_pic: !!(u.profile_pic_url && u.profile_pic_url.length > 5),
        profile_pic_url: u.profile_pic_url || "", account_age_days: null, external_url: u.external_url || null,
        is_business: !!u.is_business, email: u.email || null, phone: u.phone || null,
        suspicion_score: 0, suspicion_reasons: [], reviewed: false, approved: null, notes: "",
        created_at: now, import_batch: batchId,
      }
      const { score, reasons } = scoreFollower(f, rules); f.suspicion_score = score; f.suspicion_reasons = reasons
      return f
    })

    const existing = getFollowers()
    localStorage.setItem("ifr_followers", JSON.stringify([...mapped, ...existing]))
    const batches = JSON.parse(localStorage.getItem("ifr_batches") || "[]")
    batches.unshift({ id: batchId, filename: "instagram-connect", count: mapped.length, created_at: now })
    localStorage.setItem("ifr_batches", JSON.stringify(batches))

    setResult({ followersCount: followers.length, followingCount: following.length, skippedWhitelisted })
    setScriptStep("done")
    setImporting(false)
  }

  const goToReview = () => router.push("/review")

  const flaggedCount = result
    ? (() => { const all = getFollowers(); return all.filter(f => f.suspicion_score >= 30).length })()
    : 0

  const isBusy = connectStatus === "auth" || connectStatus === "fetch" || connectStatus === "import"

  // ── Render ──
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-white">Connect Instagram</h1>
        <p className="text-sm text-[#a1a1aa] mt-0.5">
          Import your followers & following to review and clean up.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2.5 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] rounded-xl p-4 text-sm text-[#ef4444]">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* ════ Method Tabs ════ */}
      <div className="flex gap-1.5 bg-[#121214] p-1 rounded-xl">
        {[
          { key: "quick" as Method, icon: Zap, label: "Quick Connect", desc: "One click" },
          { key: "manual" as Method, icon: LogIn, label: "Manual Login", desc: "Credentials" },
          { key: "script" as Method, icon: Terminal, label: "DevTools Script", desc: "Advanced" },
        ].map((m) => {
          const Icon = m.icon
          const active = method === m.key
          return (
            <button
              key={m.key}
              onClick={() => { setMethod(m.key); resetAll() }}
              disabled={isBusy}
              className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-[rgba(99,102,241,0.15)] text-[#818cf8] shadow-sm"
                  : "text-[#52525b] hover:text-[#a1a1aa] hover:bg-white/5"
              } disabled:opacity-50`}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{m.label}</span>
              <span className="text-[10px] opacity-60 hidden sm:inline">{m.desc}</span>
            </button>
          )
        })}
      </div>

      {/* ════════════════════════════════════════════════════════
         METHOD: Quick Connect
         ════════════════════════════════════════════════════════ */}
      {method === "quick" && (
        <div className="space-y-4">
          <div className="card p-6">
            {connectStatus === "idle" || connectStatus === "error" ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(99,102,241,0.15)] flex items-center justify-center">
                    <Zap size={20} className="text-[#818cf8]" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Quick Connect</h3>
                    <p className="text-sm text-[#a1a1aa]">One click — no scripts, no copy-paste</p>
                  </div>
                </div>

                <div className="bg-[#121214] rounded-xl p-4 mb-4 space-y-2 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.1)] text-[#818cf8] flex items-center justify-center text-xs font-bold shrink-0">1</div>
                    <div><span className="text-white">Click "Connect"</span><span className="text-[#a1a1aa]"> below</span></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.1)] text-[#818cf8] flex items-center justify-center text-xs font-bold shrink-0">2</div>
                    <div><span className="text-white">A browser window opens briefly</span><span className="text-[#a1a1aa]"> — this captures your Instagram session</span></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.1)] text-[#818cf8] flex items-center justify-center text-xs font-bold shrink-0">3</div>
                    <div><span className="text-[#22c55e]">Data loads automatically</span><span className="text-[#a1a1aa]"> — review and unfollow!</span></div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    className="btn btn-primary"
                    onClick={() => handleConnect("quick")}
                  >
                    <Zap size={16} />
                    Quick Connect
                  </button>
                  {connectStatus === "error" && (
                    <button className="btn btn-ghost" onClick={resetAll}>Dismiss</button>
                  )}
                </div>
              </>
            ) : (
              <ConnectProgress
                status={connectStatus}
                logs={logs}
                fetchProgress={fetchProgress}
                onStop={() => { abortRef.current?.abort(); setConnectStatus("error") }}
              />
            )}
          </div>

          {connectStatus !== "done" && (
            <div className="card p-4">
              <p className="text-xs text-[#52525b]">
                <strong>Requirements:</strong> Brave or Chrome browser with Instagram logged in.
                Your browser will briefly close and reopen — save your work first!
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
         METHOD: Manual Login
         ════════════════════════════════════════════════════════ */}
      {method === "manual" && (
        <div className="space-y-4">
          <div className="card p-6">
            {connectStatus === "idle" || connectStatus === "error" ? (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[rgba(99,102,241,0.15)] flex items-center justify-center">
                    <LogIn size={20} className="text-[#818cf8]" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">Manual Login</h3>
                    <p className="text-sm text-[#a1a1aa]">Enter your credentials — we'll log in automatically</p>
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Username or Email</label>
                    <input
                      type="text"
                      placeholder="yourusername"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="input w-full"
                      disabled={isBusy}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#a1a1aa] mb-1">Password</label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input w-full"
                      disabled={isBusy}
                    />
                  </div>
                </div>

                <div className="bg-[rgba(234,179,8,0.08)] border border-[rgba(234,179,8,0.15)] rounded-xl p-3 mb-4 text-xs text-[#eab308]">
                  <strong>⚠️ Security note:</strong> Your credentials stay on YOUR machine.
                  They are sent to Instagram via the browser that opens on your computer — never to any server.
                  If you have 2FA enabled, complete the challenge in the browser window that opens.
                </div>

                <div className="flex gap-3">
                  <button
                    className="btn btn-primary"
                    disabled={!username.trim() || !password.trim() || isBusy}
                    onClick={() => handleConnect("manual")}
                  >
                    <LogIn size={16} />
                    Login & Fetch
                  </button>
                  {connectStatus === "error" && (
                    <button className="btn btn-ghost" onClick={resetAll}>Dismiss</button>
                  )}
                </div>
              </>
            ) : (
              <ConnectProgress
                status={connectStatus}
                logs={logs}
                fetchProgress={fetchProgress}
                onStop={() => { abortRef.current?.abort(); setConnectStatus("error") }}
              />
            )}
          </div>

          {connectStatus !== "done" && (
            <div className="card p-4">
              <p className="text-xs text-[#a1a1aa]">
                A browser window will open briefly. If you have 2FA, complete it in that window.
                Your password is <strong>never stored</strong> — it's typed directly into Instagram's login page.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
         METHOD: DevTools Script
         ════════════════════════════════════════════════════════ */}
      {method === "script" && (
        <>
          {/* Step indicator */}
          <div className="flex gap-2 items-center text-sm">
            {["script", "paste", "done"].map((s, i) => {
              const curIdx = ["script", "paste", "done"].indexOf(scriptStep)
              const done = curIdx > i
              const active = curIdx === i
              return (
                <div key={s} className="flex items-center gap-2">
                  {i > 0 && <div className="w-6 h-px bg-[#27272a]" />}
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
                    done ? "bg-[rgba(34,197,94,0.1)] text-[#22c55e]" : active ? "bg-[rgba(99,102,241,0.1)] text-[#818cf8]" : "bg-[#121214] text-[#52525b]"
                  }`}>
                    {done ? "✓" : active ? "●" : `${i + 1}`} {["Copy Script", "Run & Paste", "Review"][i]}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Step 1: Copy Script */}
          {scriptStep === "script" && (
            <div className="space-y-4">
              <div className="card p-6">
                <h3 className="text-base font-semibold text-white mb-1">Step 1: Copy the script</h3>
                <p className="text-sm text-[#a1a1aa] mb-4">Fetches your followers and following using your live Instagram session.</p>

                <div className="bg-[#121214] rounded-xl p-4 mb-4 space-y-2 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.1)] text-[#818cf8] flex items-center justify-center text-xs font-bold shrink-0">1</div>
                    <div><span className="text-white">Copy the script</span><span className="text-[#a1a1aa]"> below</span></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.1)] text-[#818cf8] flex items-center justify-center text-xs font-bold shrink-0">2</div>
                    <div><span className="text-white">Go to instagram.com</span><span className="text-[#a1a1aa]"> (must be logged in)</span></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.1)] text-[#818cf8] flex items-center justify-center text-xs font-bold shrink-0">3</div>
                    <div><span className="text-white">Open DevTools (F12) → Console</span><span className="text-[#a1a1aa]">, paste & press Enter</span></div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[rgba(99,102,241,0.1)] text-[#818cf8] flex items-center justify-center text-xs font-bold shrink-0">4</div>
                    <div><span className="text-[#22c55e]">Wait for "📋 COPIED!"</span><span className="text-[#a1a1aa]"> — then paste the data here</span></div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button className={`btn ${copied ? 'bg-[#22c55e] text-white' : 'btn-primary'}`} onClick={handleCopyScript}>
                    {copied ? <Check size={16} /> : <Copy size={16} />}
                    {copied ? "Copied!" : "Copy Script"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setScriptStep("paste")}>
                    I have the data <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              <details className="card p-4">
                <summary className="text-sm font-medium text-[#a1a1aa] cursor-pointer flex items-center gap-2">
                  <Terminal size={14} /> Show script
                </summary>
                <pre className="mt-3 p-3 bg-[#0a0a0b] rounded-lg text-xs text-[#a1a1aa] overflow-x-auto max-h-[300px] overflow-y-auto font-mono leading-relaxed">{script}</pre>
              </details>

              <div className="card p-5">
                <h3 className="text-sm font-semibold text-white/80 mb-2">Troubleshooting</h3>
                <ul className="text-sm text-[#a1a1aa] space-y-1.5 leading-relaxed">
                  <li>• <strong>Can't paste in console?</strong> Type <code className="text-xs bg-[#1f1f23] px-1.5 py-0.5 rounded text-white/60">allow pasting</code> then paste</li>
                  <li>• <strong>Nothing copied?</strong> The script logs the output — right-click and copy manually</li>
                  <li>• <strong>Still not working?</strong> Make sure you're on <strong>instagram.com</strong> and logged in</li>
                </ul>
              </div>
            </div>
          )}

          {/* Step 2: Paste Data */}
          {scriptStep === "paste" && (
            <div className="space-y-4">
              <div className="card p-6">
                <h3 className="text-base font-semibold text-white mb-1">Step 2: Paste the data</h3>
                <p className="text-sm text-[#a1a1aa] mb-4">Paste the JSON that was copied to your clipboard.</p>
                <textarea
                  ref={pasteRef}
                  placeholder="Paste data here (Ctrl+V)..."
                  value={jsonInput}
                  onChange={e => setJsonInput(e.target.value)}
                  className="input w-full min-h-[200px] resize-y font-mono text-sm"
                />
                <div className="flex items-center gap-3 mt-3">
                  <button className="btn btn-primary" onClick={handlePasteData} disabled={importing || !jsonInput.trim()}>
                    {importing ? "Importing..." : "Import & Analyze"}
                  </button>
                  <button className="btn btn-ghost text-sm" onClick={() => setScriptStep("script")}>← Back</button>
                </div>
                {jsonInput.trim() && <p className="text-xs text-[#52525b] mt-2">~{Math.round(jsonInput.length / 1024)} KB</p>}
              </div>

              <div className="card p-4">
                <button className="flex items-center justify-between w-full text-sm text-[#a1a1aa]" onClick={() => setShowCookieTab(!showCookieTab)}>
                  <span>Using Cookie-Editor instead?</span>
                  {showCookieTab ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {showCookieTab && (
                  <div className="mt-4 pt-4 border-t border-[#27272a] space-y-3">
                    <p className="text-sm text-[#a1a1aa]">Install Cookie-Editor, export from instagram.com, paste below.</p>
                    <textarea placeholder='[{"name":"sessionid","value":"..."}, ...]' className="input w-full min-h-[60px] font-mono text-sm" />
                    <p className="text-xs text-[#eab308]">The DevTools script method is more reliable.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ════ DONE (shared across all methods) ════ */}
      {(method === "script" && scriptStep === "done" && result) ||
       (method !== "script" && connectStatus === "done" && result) ? (
        <div className="card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[rgba(34,197,94,0.1)] flex items-center justify-center mx-auto mb-4">
            <Users size={32} className="text-[#22c55e]" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-1">Data Imported!</h3>
          <p className="text-sm text-[#a1a1aa] mb-6">
            Fetched <strong>{result!.followersCount}</strong> followers and{" "}
            <strong>{result!.followingCount}</strong> following —{" "}
            <strong>{flaggedCount}</strong> flagged as suspicious
            {result!.skippedWhitelisted > 0 && (
              <span className="block mt-1 text-[#22c55e]">
                {result!.skippedWhitelisted} whitelisted skipped
              </span>
            )}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button className="btn btn-primary" onClick={goToReview}>
              Review Queue ({flaggedCount} flagged)
            </button>
            <button className="btn btn-ghost" onClick={() => {
              if (method === "script") { setScriptStep("script"); setJsonInput(""); }
              resetAll()
              setResult(null)
            }}>
              Import another
            </button>
          </div>
        </div>
      ) : null}

      {/* Info card */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white/80 mb-2">🔒 How it works</h3>
        <ul className="text-sm text-[#a1a1aa] space-y-1.5 leading-relaxed">
          <li>• <strong>Quick Connect:</strong> Opens your browser with your real profile — captures your existing Instagram session</li>
          <li>• <strong>Manual Login:</strong> Fills your credentials in a browser window — handles 2FA automatically</li>
          <li>• <strong>DevTools Script:</strong> Runs in your browser console — most reliable for large accounts</li>
          <li>• Nothing is stored on any server — all data stays in your browser's localStorage</li>
        </ul>
      </div>
    </div>
  )
}

// ── Progress display sub-component ──
function ConnectProgress({
  status, logs, fetchProgress, onStop,
}: {
  status: ConnectStatus
  logs: string[]
  fetchProgress: { phase: string; count: number }
  onStop: () => void
}) {
  const phaseLabel: Record<string, string> = {
    auth: "🔐 Authenticating...",
    fetch: "📡 Fetching data...",
    import: "📦 Importing...",
    done: "✅ Complete!",
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {status !== "done" && status !== "error" ? (
          <Loader2 size={20} className="text-[#818cf8] animate-spin" />
        ) : status === "done" ? (
          <Check size={20} className="text-[#22c55e]" />
        ) : (
          <AlertCircle size={20} className="text-[#ef4444]" />
        )}
        <div>
          <p className="text-sm font-medium text-white">{phaseLabel[status] || status}</p>
          {fetchProgress.phase && (
            <p className="text-xs text-[#a1a1aa]">
              {fetchProgress.phase === "followers" ? "👥" : "🔁"} {fetchProgress.phase}: {fetchProgress.count.toLocaleString()} loaded
            </p>
          )}
        </div>
      </div>

      {/* Progress bar for fetching */}
      {(status === "fetch" || status === "import") && (
        <div className="w-full bg-[#1f1f23] rounded-full h-1.5 overflow-hidden">
          <div className="h-full bg-[#818cf8] rounded-full animate-pulse transition-all duration-500"
            style={{ width: status === "import" ? "90%" : "50%" }}
          />
        </div>
      )}

      {/* Logs */}
      <div className="bg-[#0a0a0b] rounded-xl max-h-[200px] overflow-y-auto p-3 space-y-1">
        {logs.map((log, i) => (
          <p key={i} className="text-xs text-[#a1a1aa] font-mono leading-relaxed">{log}</p>
        ))}
        {status === "auth" && logs.length === 0 && (
          <p className="text-xs text-[#52525b] animate-pulse">Waiting...</p>
        )}
      </div>

      {/* Stop button */}
      {status === "auth" || status === "fetch" ? (
        <button className="btn btn-ghost text-sm text-[#ef4444] flex items-center gap-2" onClick={onStop}>
          <StopCircle size={14} /> Stop
        </button>
      ) : null}
    </div>
  )
}
