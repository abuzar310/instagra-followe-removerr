"use client";

import { useState, useMemo, useRef, useCallback } from "react";
import { useData } from "@/hooks/useData";
import { batchUpdateCrossCheck, clearCrossCheckStatus } from "@/lib/store";
import Avatar from "@/components/Avatar";
import {
  Users, Search, CheckCircle, XCircle, AlertTriangle, RefreshCw, Play, RotateCcw,
} from "lucide-react";

type CheckState = "idle" | "running" | "done" | "error";

export default function CrossCheckPage() {
  const { followers, refresh } = useData();
  const [state, setState] = useState<CheckState>("idle");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState({ verified: 0, unfollowed: 0, errors: 0, current: 0, total: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Filtered list
  const filtered = useMemo(() => {
    if (!search) return followers;
    const q = search.toLowerCase();
    return followers.filter((f) =>
      f.username.toLowerCase().includes(q) || f.full_name.toLowerCase().includes(q)
    );
  }, [followers, search]);

  const isEmpty = followers.length === 0;

  // Stats
  const verified = followers.filter((f) => f.cross_check_status === "verified").length;
  const unfollowed = followers.filter((f) => f.cross_check_status === "unfollowed").length;
  const errors = followers.filter((f) => f.cross_check_status === "error").length;
  const pending = followers.filter((f) => !f.cross_check_status || f.cross_check_status === "pending").length;

  // ── Start Health Check ──
  const handleStart = useCallback(async () => {
    setState("running");
    setStats({ verified: 0, unfollowed: 0, errors: 0, current: 0, total: followers.length });
    setLogs([]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/cross-check/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ followers: followers.map((f) => ({ username: f.username })) }),
        signal: abort.signal,
      });

      if (!res.ok) { setState("error"); return; }

      const reader = res.body?.getReader();
      if (!reader) { setState("error"); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let batchBuffer: { username: string; status: "verified" | "unfollowed" | "error" }[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          const lines = event.split("\n");
          let eventType = "";
          let eventData = "";

          for (const line of lines) {
            if (line.startsWith("event: ")) eventType = line.slice(7).trim();
            if (line.startsWith("data: ")) eventData = line.slice(6);
          }

          if (!eventData) continue;

          try {
            const data = JSON.parse(eventData);

            if (eventType === "checks" && Array.isArray(data)) {
              batchBuffer.push(...data);
              // Update in batches of 50 to avoid excessive writes
              if (batchBuffer.length >= 50) {
                batchUpdateCrossCheck(batchBuffer);
                batchBuffer = [];
              }
            } else if (eventType === "progress") {
              setStats(data);
            } else if (eventType === "log") {
              setLogs((prev) => [...prev.slice(-100), data.text || ""]);
            } else if (eventType === "done") {
              // Flush remaining batch
              if (batchBuffer.length > 0) {
                batchUpdateCrossCheck(batchBuffer);
              }
              refresh();
              setState("done");
            }
          } catch {}
        }
      }

      // Flush remaining
      if (batchBuffer.length > 0) {
        batchUpdateCrossCheck(batchBuffer);
        refresh();
      }
      setState((s) => (s === "running" ? "done" : s));
    } catch (err: any) {
      if (err.name === "AbortError") {
        setState("idle");
      } else {
        setState("error");
      }
    }
  }, [followers, refresh]);

  const handleStop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    // Flush pending batch
    setState("idle");
    refresh();
  }, [refresh]);

  const handleClear = () => {
    clearCrossCheckStatus();
    refresh();
    setStats({ verified: 0, unfollowed: 0, errors: 0, current: 0, total: 0 });
    setLogs([]);
    setState("idle");
  };

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Users size={48} className="text-[#27272a] mb-4" />
        <h2 className="text-lg font-semibold text-white/60 mb-2">No followers to check</h2>
        <p className="text-sm text-[#52525b] max-w-sm mb-6">
          Import your follower data first, then run a health check to see who's still following you.
        </p>
        <a href="/import" className="btn btn-primary">Import Data</a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Follower Health Check</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            Check all <span className="font-medium text-white">{followers.length.toLocaleString()}</span> followers live on Instagram
          </p>
        </div>
        <div className="flex gap-2">
          {state !== "running" && (
            <>
              <button
                className="btn text-sm bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white hover:from-[#16a34a] hover:to-[#15803d] shadow-lg shadow-[#22c55e]/20"
                onClick={handleStart}
                disabled={followers.length === 0}
              >
                <Play size={14} /> Start Health Check
              </button>
              {(verified > 0 || unfollowed > 0 || errors > 0) && (
                <button className="btn btn-ghost text-sm" onClick={handleClear}>
                  <RotateCcw size={14} /> Clear Results
                </button>
              )}
            </>
          )}
          {state === "running" && (
            <button className="btn text-sm bg-[#ef4444] text-white hover:bg-[#dc2626]" onClick={handleStop}>
              <XCircle size={14} /> Stop
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <Users size={14} className="text-[#818cf8]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">Total</span>
          </div>
          <div className="text-xl font-bold text-white">{followers.length.toLocaleString()}</div>
          <div className="text-[10px] text-[#52525b] mt-0.5">In your import</div>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={14} className="text-[#22c55e]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">Verified</span>
          </div>
          <div className="text-xl font-bold text-[#22c55e]">{verified.toLocaleString()}</div>
          <div className="text-[10px] text-[#52525b] mt-0.5">Still following you</div>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <XCircle size={14} className="text-[#ef4444]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">Unfollowed</span>
          </div>
          <div className="text-xl font-bold text-[#ef4444]">{unfollowed.toLocaleString()}</div>
          <div className="text-[10px] text-[#52525b] mt-0.5">Already unfollowed you</div>
        </div>

        <div className="card p-3.5">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-[#eab308]" />
            <span className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">Pending</span>
          </div>
          <div className="text-xl font-bold text-[#eab308]">{pending.toLocaleString()}</div>
          <div className="text-[10px] text-[#52525b] mt-0.5">Not checked yet</div>
        </div>
      </div>

      {/* Progress bar (during check) */}
      {state === "running" && stats.total > 0 && (
        <div className="card p-3.5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="text-[#22c55e] animate-spin" />
              <span className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">Checking...</span>
            </div>
            <span className="text-xs font-mono text-[#a1a1aa]">
              {stats.current} / {stats.total}
              <span className="text-[#52525b] ml-1">· {Math.round((stats.current / stats.total) * 100)}%</span>
            </span>
          </div>

          {/* Multi-bar showing breakdown */}
          <div className="w-full h-3 rounded-full bg-[#27272a] overflow-hidden flex">
            <div
              className="h-full bg-[#22c55e] transition-all duration-300"
              style={{ width: `${(stats.verified / stats.total) * 100}%` }}
            />
            <div
              className="h-full bg-[#ef4444] transition-all duration-300"
              style={{ width: `${(stats.unfollowed / stats.total) * 100}%` }}
            />
            <div
              className="h-full bg-[#eab308] transition-all duration-300"
              style={{ width: `${(stats.errors / stats.total) * 100}%` }}
            />
          </div>

          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-[#22c55e]">✓ {stats.verified}</span>
            <span className="text-[10px] text-[#ef4444]">✗ {stats.unfollowed}</span>
            <span className="text-[10px] text-[#eab308]">⚠ {stats.errors}</span>
          </div>
        </div>
      )}

      {/* Log output (during check) */}
      {state === "running" && logs.length > 0 && (
        <div className="bg-black/60 rounded-xl max-h-48 overflow-y-auto border border-[#27272a]">
          <div className="p-3 space-y-0.5">
            {logs.slice(-30).map((log, i) => (
              <p key={i} className="text-[11px] font-mono text-[#a1a1aa]/80 leading-relaxed">
                {log}
              </p>
            ))}
            <p className="text-[11px] font-mono text-[#6366f1] animate-pulse">▌</p>
          </div>
        </div>
      )}

      {/* Done message */}
      {state === "done" && (
        <div className="bg-[rgba(34,197,94,0.06)] border border-[rgba(34,197,94,0.15)] rounded-xl p-4 flex items-center gap-3">
          <CheckCircle size={20} className="text-[#22c55e] shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#22c55e]">Health Check Complete!</p>
            <p className="text-xs text-[#a1a1aa] mt-0.5">
              ✓ {verified} still following · ✗ {unfollowed} already unfollowed · ⚠ {errors} errors
            </p>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52525b]" />
        <input
          className="input w-full pl-9"
          placeholder="Search username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Results Table */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-[#52525b]">No followers match this search.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#27272a]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#121214] border-b border-[#27272a]">
                <th className="text-left px-3 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">#</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">Username</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider hidden sm:table-cell">Followers</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">Status</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider hidden md:table-cell">Checked At</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f, idx) => (
                <tr
                  key={f.id}
                  className="border-b border-[#27272a]/50 last:border-0 hover:bg-white/[0.015] transition-colors"
                >
                  <td className="px-3 py-3 text-[#52525b] font-mono text-xs">{idx + 1}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={f.profile_pic_url} username={f.username} size={28} />
                      <div className="min-w-0">
                        <span className="font-medium text-white">@{f.username}</span>
                        {f.full_name && <span className="text-[#52525b] ml-1.5 text-xs hidden lg:inline">{f.full_name}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[#a1a1aa] hidden sm:table-cell">{f.followers_count.toLocaleString()}</td>
                  <td className="px-3 py-3">
                    {!f.cross_check_status || f.cross_check_status === "pending" ? (
                      <span className="badge badge-gray">Not checked</span>
                    ) : f.cross_check_status === "verified" ? (
                      <span className="badge badge-green">Following ✓</span>
                    ) : f.cross_check_status === "unfollowed" ? (
                      <span className="badge badge-red">Unfollowed ✗</span>
                    ) : (
                      <span className="badge badge-yellow">Error ⚠</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-[#52525b] text-xs hidden md:table-cell">
                    {f.cross_checked_at
                      ? new Date(f.cross_checked_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      {filtered.length > 0 && (
        <div className="text-center text-xs text-[#52525b]">
          Showing {filtered.length} of {followers.length} followers
        </div>
      )}
    </div>
  );
}
