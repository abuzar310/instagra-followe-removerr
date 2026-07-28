"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useData } from "@/hooks/useData";
import {
  applyFilters, getDefaultFilters, exportCSV, exportJSON, addToWhitelist, removeFromWhitelist,
} from "@/lib/store";
import type { ReviewFilters, Follower, AiAnalysis } from "@/lib/types";
import Avatar from "@/components/Avatar";
import {
  Users, Search, ArrowUpDown, CheckCircle, XCircle, ChevronLeft, ChevronRight,
  Download, MoreHorizontal, AlertTriangle, Eye, X, Rocket, Copy, Terminal, Sparkles,
} from "lucide-react";
import { downloadFile } from "@/lib/utils";
import { useUnfollowStream } from "@/hooks/useUnfollowStream";

const PER_PAGE = 50;

const AI_API_KEY_STORAGE = "ifr_ai_api_key";
const AI_API_URL_STORAGE = "ifr_ai_api_url";
const AI_MODEL_STORAGE = "ifr_ai_model";

const SORT_OPTIONS: { value: ReviewFilters["sortField"]; label: string }[] = [
  { value: "suspicion_score", label: "Score" },
  { value: "followers_count", label: "Followers" },
  { value: "following_count", label: "Following" },
  { value: "posts_count", label: "Posts" },
  { value: "username", label: "Username" },
  { value: "created_at", label: "Date" },
];

export default function ReviewPage() {
  const { followers, updateFollower, deleteFollowers } = useData();
  const [filters, setFilters] = useState<ReviewFilters>(getDefaultFilters());
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<Follower | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showExport, setShowExport] = useState(false);
  const [showUnfollowDialog, setShowUnfollowDialog] = useState(false);
  const [unfollowCount, setUnfollowCount] = useState(0);
  const [unfollowTab, setUnfollowTab] = useState<"manual" | "auto">("manual");
  const [copied, setCopied] = useState(false);
  const [unfollowAccounts, setUnfollowAccounts] = useState<{ username: string; full_name?: string; profile_pic_url?: string }[]>([]);
  const [furiousMode, setFuriousMode] = useState(false);
  const [skipAlreadyUnfollowed, setSkipAlreadyUnfollowed] = useState(true);
  const [startFrom, setStartFrom] = useState<"first" | { type: "username"; value: string } | { type: "number"; value: number }>("first");
  const [startFromUsername, setStartFromUsername] = useState("");
  const [startFromNumber, setStartFromNumber] = useState("");
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AiAnalysis | null>(null);
  const { state: unfollowState, start: startUnfollow, stop: stopUnfollow, reset: resetUnfollow } = useUnfollowStream();
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => applyFilters(followers, filters), [followers, filters]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = filtered.slice(safePage * PER_PAGE, (safePage + 1) * PER_PAGE);

  const updateFilter = (patch: Partial<ReviewFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(0);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pageItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pageItems.map((f) => f.id)));
    }
  };

  const handleApprove = (id: string) => {
    // Approving an unfollow means it should NOT be whitelisted (undo a prior reject)
    removeFromWhitelist([id]);
    updateFollower(id, { reviewed: true, approved: true });
  };

  const handleReject = (id: string) => {
    // "Keep this account" — whitelist it so future fetches skip it entirely
    const f = followers.find((x) => x.id === id);
    if (f) addToWhitelist([{ id: f.id, username: f.username, full_name: f.full_name, profile_pic_url: f.profile_pic_url }]);
    updateFollower(id, { reviewed: true, approved: false });
  };

  const handleReset = (id: string) => {
    removeFromWhitelist([id]);
    updateFollower(id, { reviewed: false, approved: null });
  };

  const handleBulkApprove = () => {
    if (selectedIds.size === 0) return;
    removeFromWhitelist(Array.from(selectedIds));
    selectedIds.forEach((id) => updateFollower(id, { reviewed: true, approved: true }));
    setSelectedIds(new Set());
  };

  const handleBulkReject = () => {
    if (selectedIds.size === 0) return;
    const toKeep = followers.filter((f) => selectedIds.has(f.id));
    addToWhitelist(toKeep.map((f) => ({ id: f.id, username: f.username, full_name: f.full_name, profile_pic_url: f.profile_pic_url })));
    selectedIds.forEach((id) => updateFollower(id, { reviewed: true, approved: false }));
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Delete ${selectedIds.size} selected profiles?`)) {
      deleteFollowers(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const handleAiAnalyze = useCallback(async (f: Follower) => {
    setAiAnalyzing(true);
    setAiResult(null);
    try {
      const apiKey = localStorage.getItem(AI_API_KEY_STORAGE) || "";
      const apiUrl = localStorage.getItem(AI_API_URL_STORAGE) || "https://api.kintio.com";
      const model = localStorage.getItem(AI_MODEL_STORAGE) || "claude-3-haiku-20240307";

      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey,
          apiUrl,
          model,
          profile: {
            username: f.username,
            full_name: f.full_name,
            biography: f.biography,
            followers_count: f.followers_count,
            following_count: f.following_count,
            posts_count: f.posts_count,
            has_profile_pic: f.has_profile_pic,
            is_private: f.is_private,
            is_verified: f.is_verified,
            is_business: f.is_business,
            account_age_days: f.account_age_days,
            external_url: f.external_url,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.verdict) {
        const analysis: AiAnalysis = {
          verdict: data.verdict,
          confidence: data.confidence,
          reasoning: data.reasoning,
          analyzed_at: new Date().toISOString(),
        };
        setAiResult(analysis);
        updateFollower(f.id, { ai_analysis: analysis });
      } else {
        setAiResult({ verdict: "unknown", confidence: 0, reasoning: data.error || "Analysis failed", analyzed_at: new Date().toISOString() });
      }
    } catch (e: any) {
      setAiResult({ verdict: "unknown", confidence: 0, reasoning: e.message || "Network error", analyzed_at: new Date().toISOString() });
    } finally {
      setAiAnalyzing(false);
    }
  }, [updateFollower]);

  const openPreview = (f: Follower) => {
    setPreview(f);
    setNotesDraft(f.notes);
    setAiResult(f.ai_analysis || null);
  };

  const saveNotes = () => {
    if (!preview) return;
    updateFollower(preview.id, { notes: notesDraft });
  };

  const handleStartUnfollow = () => {
    const approved = followers.filter((f) => f.approved === true);
    if (approved.length === 0) return;

    // Create JSON in the format expected by unfollow-brave.mjs
    const data = approved.map((f) => ({
      username: f.username,
      full_name: f.full_name,
      profile_pic_url: f.profile_pic_url,
    }));

    // Download the file using the existing helper
    downloadFile(JSON.stringify(data, null, 2), "to-unfollow.json", "application/json");

    setUnfollowAccounts(data);
    setUnfollowCount(approved.length);
    setCopied(false);
    setUnfollowTab("manual");
    resetUnfollow();
    setShowUnfollowDialog(true);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "s" && !e.metaKey && !e.ctrlKey) { e.preventDefault(); searchRef.current?.focus(); return; }

      if (preview) {
        if (e.key === "a" || e.key === "A") { handleApprove(preview.id); setPreview(null); }
        if (e.key === "r" || e.key === "R") { handleReject(preview.id); setPreview(null); }
        if (e.key === "Escape") { saveNotes(); setPreview(null); }
        return;
      }

      if (e.key === "j") { e.preventDefault(); setPage((p) => Math.min(p + 1, totalPages - 1)); }
      if (e.key === "k") { e.preventDefault(); setPage((p) => Math.max(p - 1, 0)); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [preview, totalPages]);

  const isEmpty = followers.length === 0;
  const reviewedCount = followers.filter((f) => f.reviewed).length;
  const approvedCount = followers.filter((f) => f.approved === true).length;
  const rejectedCount = followers.filter((f) => f.approved === false).length;
  const pendingCount = followers.length - reviewedCount;

  const scoreColor = (score: number) =>
    score >= 60 ? "#ef4444" : score >= 30 ? "#eab308" : "#22c55e";

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Users size={48} className="text-[#27272a] mb-4" />
        <h2 className="text-lg font-semibold text-white/60 mb-2">Nothing to review</h2>
        <p className="text-sm text-[#52525b] max-w-sm mb-6">
          Import your follower data first to see the review queue.
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
          <h1 className="text-xl font-semibold text-white">Review Queue</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            <span className="font-medium text-white">{followers.length.toLocaleString()}</span> profiles
            · <span className="text-[#a1a1aa]">{reviewedCount.toLocaleString()}</span> reviewed
            · <span className="text-[#22c55e]">✓ {approvedCount.toLocaleString()}</span>
            · <span className="text-[#ef4444]">✗ {rejectedCount.toLocaleString()}</span>
            · <span className="text-[#52525b]">{pendingCount.toLocaleString()}</span> pending
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <button className="btn btn-ghost text-sm" onClick={() => setShowExport(!showExport)}>
              <Download size={14} /> Export
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1.5 z-20 card p-1.5 min-w-[160px] shadow-xl">
                <button className="btn btn-ghost text-sm w-full justify-start" onClick={() => { downloadFile(exportCSV(filtered), "follower-review.csv", "text/csv"); setShowExport(false); }}>
                  📄 CSV — All
                </button>
                <button className="btn btn-ghost text-sm w-full justify-start" onClick={() => { downloadFile(exportJSON(filtered), "follower-review.json", "application/json"); setShowExport(false); }}>
                  📋 JSON — All
                </button>
                <div className="border-t border-[#27272a] my-1" />
                <button className="btn btn-ghost text-sm w-full justify-start" onClick={() => { const approved = filtered.filter((f) => f.approved === true); downloadFile(exportCSV(approved), "follower-review-approved.csv", "text/csv"); setShowExport(false); }}>
                  📄 CSV — Approved only
                </button>
                <button className="btn btn-ghost text-sm w-full justify-start" onClick={() => { const approved = filtered.filter((f) => f.approved === true); downloadFile(exportJSON(approved), "follower-review-approved.json", "application/json"); setShowExport(false); }}>
                  📋 JSON — Approved only
                </button>
              </div>
            )}
          </div>
          {selectedIds.size > 0 && (
            <>
              <button className="btn text-sm bg-[#22c55e] text-white hover:bg-[#16a34a]" onClick={handleBulkApprove} title="Approve unfollow for selected — they will be unfollowed">
                <CheckCircle size={14} /> Approve {selectedIds.size}
              </button>
              <button className="btn text-sm bg-[#ef4444] text-white hover:bg-[#dc2626]" onClick={handleBulkReject} title="Keep selected — whitelisted, never shown again">
                <XCircle size={14} /> Keep {selectedIds.size}
              </button>
              <button className="btn btn-ghost text-sm" onClick={handleBulkDelete} title="Remove rows from list only — will reappear on next fetch">
                Delete {selectedIds.size}
              </button>
            </>
          )}

          {/* Start Unfollow button */}
          {followers.filter((f) => f.approved === true).length > 0 && (
            <button className="btn text-sm bg-gradient-to-r from-[#ec4899] to-[#8b5cf6] text-white hover:from-[#db2777] hover:to-[#7c3aed] shadow-lg shadow-[#ec4899]/20" onClick={handleStartUnfollow}>
              <Rocket size={14} /> Start Unfollow
            </button>
          )}
        </div>
      </div>

      {/* Progress Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Review Progress */}
        <div className="card p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
              <CheckCircle size={12} className="inline mr-1 text-[#22c55e]" />
              Review Progress
            </span>
            <span className="text-xs font-mono text-[#52525b]">
              {reviewedCount.toLocaleString()} / {followers.length.toLocaleString()}
              <span className="text-[#a1a1aa]"> · {followers.length > 0 ? Math.round((reviewedCount / followers.length) * 100) : 0}%</span>
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#27272a] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${followers.length > 0 ? (reviewedCount / followers.length) * 100 : 0}%`,
                background: 'linear-gradient(90deg, #22c55e, #16a34a)',
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-[#52525b]">
              <span className="text-[#22c55e]">✓ {approvedCount.toLocaleString()}</span>
              <span className="mx-1">·</span>
              <span className="text-[#ef4444]">✗ {rejectedCount.toLocaleString()}</span>
            </span>
            <span className="text-[10px] text-[#52525b]">{pendingCount.toLocaleString()} pending</span>
          </div>
        </div>

        {/* Unfollow Progress */}
        <div className="card p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#a1a1aa]">
              <Rocket size={12} className="inline mr-1 text-[#8b5cf6]" />
              Approved to Unfollow
            </span>
            <span className="text-xs font-mono text-[#52525b]">
              {approvedCount.toLocaleString()} / {followers.length.toLocaleString()}
              <span className="text-[#a1a1aa]"> · {followers.length > 0 ? Math.round((approvedCount / followers.length) * 100) : 0}%</span>
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#27272a] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${followers.length > 0 ? (approvedCount / followers.length) * 100 : 0}%`,
                background: 'linear-gradient(90deg, #8b5cf6, #6366f1)',
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[10px] text-[#52525b]">
              {approvedCount > 0 ? (
                <>
                  <Rocket size={10} className="inline mr-0.5 text-[#8b5cf6]" />
                  <span className="text-[#8b5cf6]">{approvedCount.toLocaleString()}</span> to unfollow
                </>
              ) : (
                <span>Approve accounts to start</span>
              )}
            </span>
            <span className="text-[10px] text-[#52525b]">
              ~{approvedCount > 0 ? Math.ceil(approvedCount / 357) : 0} session{approvedCount > 357 ? 's' : ''} needed
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#52525b]" />
          <input
            ref={searchRef}
            className="input w-full pl-9"
            placeholder="Search username..."
            value={filters.search}
            onChange={(e) => updateFilter({ search: e.target.value })}
          />
        </div>
        <select className="select text-sm" value={filters.sortField} onChange={(e) => updateFilter({ sortField: e.target.value as any })}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button className="btn btn-ghost text-sm" onClick={() => updateFilter({ sortOrder: filters.sortOrder === "asc" ? "desc" : "asc" })}>
          <ArrowUpDown size={14} /> {filters.sortOrder === "asc" ? "Asc" : "Desc"}
        </button>
        <select className="select text-sm" value={filters.reviewed} onChange={(e) => updateFilter({ reviewed: e.target.value as any })}>
          <option value="unreviewed">Unreviewed</option>
          <option value="all">All</option>
          <option value="reviewed">Reviewed</option>
        </select>
        <select className="select text-sm" value={filters.approved} onChange={(e) => updateFilter({ approved: e.target.value as any })}>
          <option value="all">All status</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        {(filters.search || filters.reviewed !== "unreviewed" || filters.approved !== "all") && (
          <button className="btn btn-ghost text-sm text-[#eab308]" onClick={() => setFilters(getDefaultFilters())}>
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      {pageItems.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-[#52525b]">No profiles match these filters.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-[#27272a]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#121214] border-b border-[#27272a]">
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    className="accent-[#6366f1]"
                    checked={pageItems.length > 0 && selectedIds.size === pageItems.length}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="text-left px-3 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">Username</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider hidden sm:table-cell">Followers</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider hidden md:table-cell">Following</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">Score</th>
                <th className="text-left px-3 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">Status</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((f) => (
                <tr
                  key={f.id}
                  className={`border-b border-[#27272a]/50 last:border-0 hover:bg-white/[0.015] cursor-pointer transition-colors ${
                    selectedIds.has(f.id) ? "bg-[rgba(99,102,241,0.05)]" : ""
                  }`}
                  onClick={() => openPreview(f)}
                >
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="accent-[#6366f1]"
                      checked={selectedIds.has(f.id)}
                      onChange={() => toggleSelect(f.id)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={f.profile_pic_url} username={f.username} size={30} />
                      <div className="min-w-0">
                        <span className="font-medium text-white">@{f.username}</span>
                        {f.full_name && <span className="text-[#52525b] ml-1.5 text-xs hidden lg:inline">{f.full_name}</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[#a1a1aa] hidden sm:table-cell">{f.followers_count.toLocaleString()}</td>
                  <td className="px-3 py-3 text-[#a1a1aa] hidden md:table-cell">{f.following_count.toLocaleString()}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-12 h-1.5 rounded-full bg-[#27272a] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${f.suspicion_score}%`, background: scoreColor(f.suspicion_score) }}
                        />
                      </div>
                      <span className="font-mono text-xs font-semibold" style={{ color: scoreColor(f.suspicion_score) }}>
                        {f.suspicion_score}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {!f.reviewed ? (
                      f.suspicion_score >= 30 ? (
                        <span className="badge badge-yellow">Flagged</span>
                      ) : (
                        <span className="badge badge-gray">Pending</span>
                      )
                    ) : f.approved ? (
                      <span className="badge badge-green">Approved</span>
                    ) : (
                      <span className="badge badge-red">Rejected</span>
                    )}
                  </td>
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      {!f.reviewed || f.approved === false ? (
                        <button className="btn btn-ghost btn-sm p-1.5" onClick={() => handleApprove(f.id)} title="Approve">
                          <CheckCircle size={14} className="text-[#22c55e]" />
                        </button>
                      ) : null}
                      {(!f.reviewed || f.approved === true) ? (
                        <button className="btn btn-ghost btn-sm p-1.5" onClick={() => handleReject(f.id)} title="Reject">
                          <XCircle size={14} className="text-[#ef4444]" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="btn btn-ghost btn-sm" disabled={safePage === 0} onClick={() => setPage(0)}>
            <ChevronLeft size={14} /><ChevronLeft size={14} />
          </button>
          <button className="btn btn-ghost btn-sm" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft size={14} />
          </button>
          <span className="text-sm text-[#52525b] px-2">
            Page {safePage + 1} of {totalPages}
          </span>
          <button className="btn btn-ghost btn-sm" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight size={14} />
          </button>
          <button className="btn btn-ghost btn-sm" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>
            <ChevronRight size={14} /><ChevronRight size={14} />
          </button>
        </div>
      )}

      <div className="text-center text-xs text-[#52525b]">
        Showing {safePage * PER_PAGE + 1}–{Math.min((safePage + 1) * PER_PAGE, filtered.length)} of {filtered.length}
      </div>

      {/* Preview Modal — Instagram-style profile card */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { saveNotes(); setPreview(null); } }}
        >
          <div className="card w-full max-w-lg max-h-[85vh] overflow-y-auto p-0 animate-in fade-in zoom-in-95 duration-150">
            {/* Cover area with gradient */}
            <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16213e] px-6 pt-8 pb-6 rounded-t-xl relative">
              <button className="absolute top-3 right-3 btn btn-ghost btn-sm p-1.5" onClick={() => { saveNotes(); setPreview(null); }}>
                <X size={16} />
              </button>

              {/* Big profile photo */}
              <div className="flex flex-col items-center text-center">
                <div className="relative mb-3">
                  <Avatar src={preview.profile_pic_url} username={preview.username} size={88} />
                  {/* Profile pic status badge */}
                  {!preview.has_profile_pic && preview.profile_pic_url && (
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-[#eab308] rounded-full flex items-center justify-center border-2 border-[#1a1a2e]" title="Default Instagram avatar">
                      <span className="text-[9px]">⬜</span>
                    </div>
                  )}
                  {preview.is_verified && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#0095f6] rounded-full flex items-center justify-center border-2 border-[#1a1a2e]">
                      <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="currentColor">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z" />
                      </svg>
                    </div>
                  )}
                </div>

                <h2 className="text-lg font-bold text-white">{preview.full_name || `@${preview.username}`}</h2>
                <p className="text-sm text-[#a1a1aa]">@{preview.username}</p>

                {/* Badges row */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
                  {preview.is_private && (
                    <span className="text-[10px] font-medium bg-[rgba(239,68,68,0.15)] text-[#ef4444] px-2 py-0.5 rounded-full border border-[rgba(239,68,68,0.2)]">🔒 Private</span>
                  )}
                  {preview.is_verified && (
                    <span className="text-[10px] font-medium bg-[rgba(0,149,246,0.15)] text-[#0095f6] px-2 py-0.5 rounded-full border border-[rgba(0,149,246,0.2)]">✅ Verified</span>
                  )}
                  {preview.is_business && (
                    <span className="text-[10px] font-medium bg-[rgba(99,102,241,0.15)] text-[#6366f1] px-2 py-0.5 rounded-full border border-[rgba(99,102,241,0.2)]">💼 Business</span>
                  )}
                  {!preview.has_profile_pic && preview.profile_pic_url && (
                    <span className="text-[10px] font-medium bg-[rgba(234,179,8,0.15)] text-[#eab308] px-2 py-0.5 rounded-full border border-[rgba(234,179,8,0.2)]">⬜ Default Avatar</span>
                  )}
                </div>
              </div>

              {/* Instagram-style stats row */}
              <div className="flex items-center justify-center gap-8 mt-4 pt-4 border-t border-white/10">
                <div className="text-center">
                  <div className="text-base font-bold text-white">{preview.posts_count.toLocaleString()}</div>
                  <div className="text-[10px] text-[#52525b] font-medium uppercase tracking-wider">Posts</div>
                </div>
                <div className="text-center">
                  <div className="text-base font-bold text-white">{preview.followers_count.toLocaleString()}</div>
                  <div className="text-[10px] text-[#52525b] font-medium uppercase tracking-wider">Followers</div>
                </div>
                <div className="text-center">
                  <div className="text-base font-bold text-white">{preview.following_count.toLocaleString()}</div>
                  <div className="text-[10px] text-[#52525b] font-medium uppercase tracking-wider">Following</div>
                </div>
              </div>
            </div>

            {/* Body content */}
            <div className="p-6 space-y-4">
              {/* Score indicator */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-[#27272a] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${preview.suspicion_score}%`,
                      background: preview.suspicion_score >= 60
                        ? 'linear-gradient(90deg, #eab308, #ef4444)'
                        : preview.suspicion_score >= 30
                          ? 'linear-gradient(90deg, #22c55e, #eab308)'
                          : 'linear-gradient(90deg, #22c55e, #16a34a)',
                    }}
                  />
                </div>
                <span
                  className="text-xs font-bold font-mono"
                  style={{
                    color: preview.suspicion_score >= 60 ? '#ef4444' : preview.suspicion_score >= 30 ? '#eab308' : '#22c55e',
                  }}
                >
                  {preview.suspicion_score}/100
                </span>
              </div>

              {/* Bio */}
              {preview.biography ? (
                <div className="text-sm text-[#a1a1aa] leading-relaxed">
                  {preview.biography}
                </div>
              ) : (
                <div className="text-sm text-[#52525b] italic">No bio</div>
              )}

              {/* External URL */}
              {preview.external_url && (
                <div className="text-sm">
                  <span className="text-[#52525b]">🔗 </span>
                  <a href={preview.external_url} target="_blank" rel="noopener noreferrer" className="text-[#0095f6] hover:underline">
                    {preview.external_url.replace(/^https?:\/\//, '').slice(0, 40)}
                  </a>
                </div>
              )}

              {/* Account age */}
              <div className="text-xs text-[#52525b]">
                {preview.account_age_days
                  ? `Account created ${preview.account_age_days} days ago`
                  : 'Account age unknown'}
              </div>

              {/* Suspicion reasons */}
              {preview.suspicion_reasons.length > 0 && (
                <div className="bg-[rgba(239,68,68,0.06)] border border-[rgba(239,68,68,0.15)] rounded-xl p-4">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <AlertTriangle size={14} className="text-[#ef4444]" />
                    <span className="text-xs font-semibold text-[#ef4444]">Suspicion Flags ({preview.suspicion_reasons.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.suspicion_reasons.map((reason, i) => (
                      <span
                        key={i}
                        className="text-[11px] font-medium bg-[rgba(239,68,68,0.1)] text-[#ef4444]/80 px-2 py-1 rounded-md border border-[rgba(239,68,68,0.1)]"
                      >
                        🚩 {reason}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {preview.suspicion_reasons.length === 0 && (
                <div className="bg-[rgba(34,197,94,0.06)] border border-[rgba(34,197,94,0.15)] rounded-xl p-4">
                  <p className="text-sm text-[#22c55e] flex items-center gap-1.5">
                    ✅ No suspicion flags raised
                  </p>
                </div>
              )}

              {/* AI Analysis Section */}
              <div className="rounded-xl border border-[rgba(99,102,241,0.15)] overflow-hidden">
                {/* AI Analyze Button (only show if no result yet) */}
                {!aiResult && !aiAnalyzing && (
                  <button
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-sm font-medium text-[#818cf8] hover:bg-[rgba(99,102,241,0.06)] transition-colors"
                    onClick={() => handleAiAnalyze(preview)}
                  >
                    <Sparkles size={14} />
                    AI Analyze This Profile
                  </button>
                )}

                {/* Loading state */}
                {aiAnalyzing && (
                  <div className="p-3 flex items-center gap-2.5">
                    <svg className="animate-spin h-4 w-4 text-[#818cf8] shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-xs text-[#a1a1aa]">🤖 AI is analyzing this profile...</span>
                  </div>
                )}

                {/* AI Result */}
                {aiResult && !aiAnalyzing && (
                  <div className={`p-3 ${aiResult.verdict === "bot" ? "bg-[rgba(239,68,68,0.06)]" : aiResult.verdict === "suspicious" ? "bg-[rgba(234,179,8,0.06)]" : aiResult.verdict === "real" ? "bg-[rgba(34,197,94,0.06)]" : "bg-[#121214]"}`}>
                    <div className="flex items-start justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Sparkles size={12} className="text-[#818cf8]" />
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-[#818cf8]">AI Verdict</span>
                      </div>
                      <button
                        className="text-[10px] text-[#818cf8] hover:underline"
                        onClick={() => handleAiAnalyze(preview)}
                      >
                        Re-analyze
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-sm font-bold ${
                        aiResult.verdict === "bot" ? "text-[#ef4444]" :
                        aiResult.verdict === "suspicious" ? "text-[#eab308]" :
                        aiResult.verdict === "real" ? "text-[#22c55e]" :
                        "text-[#52525b]"
                      }`}>
                        {aiResult.verdict === "bot" ? "🤖 Bot" :
                         aiResult.verdict === "suspicious" ? "⚠️ Suspicious" :
                         aiResult.verdict === "real" ? "✅ Real Person" :
                         "❓ Unknown"}
                      </span>
                      <div className="flex-1 h-1.5 rounded-full bg-[#27272a] overflow-hidden max-w-[80px]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${aiResult.confidence}%`,
                            background: aiResult.confidence >= 70 ? '#ef4444' : aiResult.confidence >= 40 ? '#eab308' : '#22c55e',
                          }}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-[#52525b]">{aiResult.confidence}%</span>
                    </div>

                    {aiResult.reasoning && (
                      <p className="text-[11px] text-[#a1a1aa] leading-relaxed">{aiResult.reasoning}</p>
                    )}

                    {aiResult.analyzed_at && (
                      <p className="text-[9px] text-[#52525b] mt-1">
                        Analyzed {new Date(aiResult.analyzed_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#52525b] mb-1.5">Notes</label>
                <textarea
                  className="input w-full resize-y min-h-[56px] text-sm"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  onBlur={saveNotes}
                  placeholder="Add a note about this account..."
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                {(!preview.reviewed || preview.approved === false) && (
                  <button className="btn btn-primary flex-1 justify-center" onClick={() => { handleApprove(preview.id); setPreview(null); }}>
                    <CheckCircle size={14} /> Approve to Unfollow
                  </button>
                )}
                {(!preview.reviewed || preview.approved === true) && (
                  <button className="btn btn-danger flex-1 justify-center" onClick={() => { handleReject(preview.id); setPreview(null); }}>
                    <XCircle size={14} /> Keep (Reject)
                  </button>
                )}
                <button className="btn btn-ghost" onClick={() => { saveNotes(); setPreview(null); }}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unfollow Dialog */}
      {showUnfollowDialog && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowUnfollowDialog(false); }}
        >
          <div className="card w-full max-w-lg p-0 animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-[#27272a]">
              <button
                className={`flex-1 py-3 text-sm font-medium transition-colors relative ${unfollowTab === "manual" ? "text-white" : "text-[#52525b] hover:text-[#a1a1aa]"}`}
                onClick={() => setUnfollowTab("manual")}
              >
                <Terminal size={14} className="inline mr-1.5" />
                Manual
                {unfollowTab === "manual" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8b5cf6]" />
                )}
              </button>
              <button
                className={`flex-1 py-3 text-sm font-medium transition-colors relative ${unfollowTab === "auto" ? "text-white" : "text-[#52525b] hover:text-[#a1a1aa]"}`}
                onClick={() => setUnfollowTab("auto")}
              >
                <Rocket size={14} className="inline mr-1.5" />
                Auto-Run
                {unfollowTab === "auto" && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#ec4899]" />
                )}
              </button>
            </div>

            <div className="p-6">
              {/* ── MANUAL TAB ── */}
              {unfollowTab === "manual" && (
                <div className="text-center">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#ec4899] to-[#8b5cf6] flex items-center justify-center mx-auto mb-3">
                    <Terminal size={22} className="text-white" />
                  </div>

                  <h2 className="text-lg font-semibold text-white mb-1">Manual Unfollow</h2>
                  <p className="text-sm text-[#a1a1aa] mb-4">
                    <strong className="text-white text-lg">{unfollowCount}</strong> approved accounts
                  </p>

                  <div className="bg-[#121214] rounded-lg p-3 mb-3 text-left">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-[#52525b]">
                        <Terminal size={12} className="inline mr-1" />
                        Run this command
                      </span>
                      <button
                        className="text-xs text-[#6366f1] hover:text-[#818cf8] flex items-center gap-1"
                        onClick={() => {
                          navigator.clipboard.writeText(`node scripts/unfollow-brave.mjs to-unfollow.json`);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                      >
                        <Copy size={12} /> {copied ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <code className="block text-sm text-[#22d3ee] font-mono bg-black/40 rounded p-2 break-all">
                      node scripts/unfollow-brave.mjs to-unfollow.json
                    </code>
                  </div>

                  <div className="bg-[#121214] rounded-lg p-3 mb-4 text-left">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#52525b]">
                      🔥 Furious mode (faster, higher risk)
                    </span>
                    <code className="block text-sm text-[#22d3ee] font-mono bg-black/40 rounded p-2 mt-1 break-all">
                      node scripts/unfollow-brave.mjs to-unfollow.json -f
                    </code>
                  </div>

                  <div className="text-xs text-[#52525b] mb-5 space-y-1">
                    <p>✅ File <strong className="text-[#a1a1aa]">to-unfollow.json</strong> has been downloaded</p>
                    <p>📂 Run the command from the project folder in your terminal</p>
                  </div>

                  <div className="flex gap-2">
                    <button className="btn btn-primary flex-1 justify-center" onClick={() => setShowUnfollowDialog(false)}>
                      Got it!
                    </button>
                  </div>
                </div>
              )}

              {/* ── AUTO-RUN TAB ── */}
              {unfollowTab === "auto" && (
                <div className="text-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${unfollowState.status === "running" ? "bg-[#22c55e]" : unfollowState.status === "done" ? "bg-[#8b5cf6]" : unfollowState.status === "error" || unfollowState.blocked ? "bg-[#ef4444]" : unfollowState.status === "stopped" ? "bg-[#eab308]" : "bg-gradient-to-br from-[#ec4899] to-[#8b5cf6]"}`}>
                    {unfollowState.status === "running" ? (
                      <svg className="animate-spin h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : unfollowState.status === "done" ? (
                      <Rocket size={22} className="text-white" />
                    ) : unfollowState.blocked ? (
                      <span className="text-white text-xl">🚫</span>
                    ) : (
                      <Rocket size={22} className="text-white" />
                    )}
                  </div>

                  <h2 className="text-lg font-semibold text-white mb-1">
                    {unfollowState.status === "idle" && "Auto-Run Unfollow"}
                    {unfollowState.status === "running" && "Running..."}
                    {unfollowState.status === "done" && "All Done! 🎉"}
                    {unfollowState.status === "stopped" && "Stopped"}
                    {(unfollowState.status === "error" || unfollowState.blocked) && "Stopped"}
                  </h2>
                  <p className="text-sm text-[#a1a1aa] mb-4">
                    <strong className="text-white text-lg">{unfollowCount}</strong> approved accounts
                  </p>

                  {/* Live progress stats */}
                  {(unfollowState.status === "running" || unfollowState.status === "done" || unfollowState.status === "stopped") && (
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.15)] rounded-lg p-2.5">
                        <div className="text-lg font-bold text-[#22c55e]">{unfollowState.removed}</div>
                        <div className="text-[10px] text-[#22c55e]/70 uppercase tracking-wider">Removed</div>
                      </div>
                      <div className="bg-[rgba(234,179,8,0.08)] border border-[rgba(234,179,8,0.15)] rounded-lg p-2.5">
                        <div className="text-lg font-bold text-[#eab308]">{unfollowState.skipped}</div>
                        <div className="text-[10px] text-[#eab308]/70 uppercase tracking-wider">Skipped</div>
                      </div>
                      <div className={`rounded-lg p-2.5 ${unfollowState.errors > 0 ? "bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.15)]" : "bg-[#121214]"}`}>
                        <div className={`text-lg font-bold ${unfollowState.errors > 0 ? "text-[#ef4444]" : "text-[#52525b]"}`}>{unfollowState.errors}</div>
                        <div className={`text-[10px] uppercase tracking-wider ${unfollowState.errors > 0 ? "text-[#ef4444]/70" : "text-[#52525b]"}`}>Errors</div>
                      </div>
                    </div>
                  )}

                  {/* Live progress bar */}
                  {unfollowState.status === "running" && unfollowState.total > 0 && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[#a1a1aa]">
                          {unfollowState.removed + unfollowState.skipped + unfollowState.errors} / {unfollowState.total}
                        </span>
                        <span className="text-xs text-[#a1a1aa]">
                          {Math.round(((unfollowState.removed + unfollowState.skipped + unfollowState.errors) / unfollowState.total) * 100)}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-[#27272a] overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300 ease-out"
                          style={{
                            width: `${((unfollowState.removed + unfollowState.skipped + unfollowState.errors) / unfollowState.total) * 100}%`,
                            background: unfollowState.blocked
                              ? 'linear-gradient(90deg, #ef4444, #dc2626)'
                              : 'linear-gradient(90deg, #8b5cf6, #6366f1)',
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Block warning */}
                  {unfollowState.blocked && (
                    <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] rounded-lg p-3 mb-3">
                      <p className="text-xs font-semibold text-[#ef4444]">🚫 Instagram Block Detected</p>
                      <p className="text-[11px] text-[#ef4444]/80 mt-0.5">
                        Script stopped automatically. Wait a few hours then resume with --resume.
                      </p>
                    </div>
                  )}

                  {/* Status message */}
                  {unfollowState.message && (
                    <p className="text-xs text-[#a1a1aa] mb-3">{unfollowState.message}</p>
                  )}

                  {/* Log output */}
                  {(unfollowState.status === "running" || unfollowState.status === "done" || unfollowState.status === "stopped" || unfollowState.blocked) && (
                    <div className="bg-black/60 rounded-lg mb-4 text-left max-h-[180px] overflow-y-auto">
                      <div className="p-2.5 space-y-0.5">
                        {unfollowState.logs.slice(-20).map((log, i) => (
                          <p key={i} className={`text-[11px] font-mono leading-relaxed ${log.stderr ? "text-[#ef4444]/70" : "text-[#a1a1aa]/80"}`}>
                            {log.text}
                          </p>
                        ))}
                        {unfollowState.status === "running" && (
                          <p className="text-[11px] font-mono text-[#6366f1] animate-pulse">▌</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Start From options (only when idle) */}
                  {unfollowState.status === "idle" && (
                    <div className="bg-[#121214] rounded-lg p-3 mb-3 text-left space-y-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b]">Start From</p>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="startFrom"
                          className="accent-[#6366f1]"
                          checked={startFrom === "first"}
                          onChange={() => setStartFrom("first")}
                        />
                        <span className="text-xs text-[#a1a1aa]">First account</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="startFrom"
                          className="accent-[#6366f1]"
                          checked={startFrom !== "first" && startFrom.type === "username"}
                          onChange={() => { setStartFrom({ type: "username", value: startFromUsername }); }}
                        />
                        <span className="text-xs text-[#a1a1aa]">From username: </span>
                        <input
                          type="text"
                          placeholder="@username"
                          className="input text-xs py-1 px-2 w-28"
                          value={startFromUsername}
                          onClick={() => setStartFrom({ type: "username", value: startFromUsername })}
                          onChange={(e) => {
                            setStartFromUsername(e.target.value)
                            setStartFrom({ type: "username", value: e.target.value })
                          }}
                        />
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="startFrom"
                          className="accent-[#6366f1]"
                          checked={startFrom !== "first" && startFrom.type === "number"}
                          onChange={() => { const n = parseInt(startFromNumber) || 1; setStartFrom({ type: "number", value: n }); }}
                        />
                        <span className="text-xs text-[#a1a1aa]">From account #: </span>
                        <input
                          type="number"
                          min="1"
                          max={unfollowCount}
                          placeholder="1"
                          className="input text-xs py-1 px-2 w-20"
                          value={startFromNumber}
                          onClick={() => { const n = parseInt(startFromNumber) || 1; setStartFrom({ type: "number", value: n }); }}
                          onChange={(e) => {
                            setStartFromNumber(e.target.value)
                            const n = parseInt(e.target.value) || 1
                            setStartFrom({ type: "number", value: n })
                          }}
                        />
                        <span className="text-[10px] text-[#52525b]">/ {unfollowCount}</span>
                      </label>
                    </div>
                  )}

                  {/* Info card about already-unfollowed check */}
                  <div className="bg-[rgba(99,102,241,0.06)] border border-[rgba(99,102,241,0.15)] rounded-lg p-3 mb-3 text-left">
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[rgba(99,102,241,0.15)] flex items-center justify-center shrink-0 mt-0.5">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                          <circle cx="9" cy="7" r="4"/>
                          <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                          <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[#818cf8]">Follower Cross-Check</p>
                        <p className="text-[11px] text-[#a1a1aa] mt-0.5 leading-relaxed">
                          Before unfollowing each account, the script checks your live followers list.
                          If they <strong className="text-[#a1a1aa]">no longer follow you</strong>, they'll be skipped automatically.
                          This saves unnecessary API calls and keeps your account safe.
                        </p>
                        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#52525b]">
                          <span className="text-[#22c55e]">✅ {unfollowCount} approved</span>
                          <span className="text-[#52525b]">·</span>
                          <span className="text-[#818cf8]">↪️ Live check on Instagram</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Furious mode toggle (always visible) */}
                  <label className="flex items-center justify-center gap-2 mb-3 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={furiousMode}
                        onChange={(e) => {
                          const newVal = e.target.checked
                          setFuriousMode(newVal)
                          // If running, restart with new setting (progress is saved)
                          if (unfollowState.status === "running") {
                            stopUnfollow()
                            setTimeout(() => startUnfollow(unfollowAccounts, newVal, startFrom), 500)
                          }
                        }}
                      />
                      <div className={`w-9 h-5 rounded-full transition-colors ${furiousMode ? 'bg-[#ec4899]' : 'bg-[#27272a]'}`}>
                        <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mt-0.5 ${furiousMode ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                      </div>
                    </div>
                    <span className={`text-xs font-medium ${furiousMode ? 'text-[#ec4899]' : 'text-[#52525b]'}`}>
                      🔥 Furious Mode — {furiousMode ? 'faster pace' : 'normal pace'}
                    </span>
                  </label>

                  {/* Skip already-unfollowed toggle */}
                  <label className="flex items-center justify-center gap-2 mb-4 cursor-pointer select-none">
                    <div className="relative">
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={skipAlreadyUnfollowed}
                        onChange={(e) => setSkipAlreadyUnfollowed(e.target.checked)}
                      />
                      <div className={`w-9 h-5 rounded-full transition-colors ${skipAlreadyUnfollowed ? 'bg-[#818cf8]' : 'bg-[#27272a]'}`}>
                        <div className={`w-3.5 h-3.5 rounded-full bg-white transition-transform mt-0.5 ${skipAlreadyUnfollowed ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
                      </div>
                    </div>
                    <span className={`text-xs font-medium ${skipAlreadyUnfollowed ? 'text-[#818cf8]' : 'text-[#52525b]'}`}>
                      ↪️ Skip already unfollowed — {skipAlreadyUnfollowed ? 'tracked separately' : 'counted as skipped'}
                    </span>
                  </label>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {unfollowState.status === "idle" && (
                      <>
                        <button
                          className="btn flex-1 justify-center bg-gradient-to-r from-[#ec4899] to-[#8b5cf6] text-white hover:from-[#db2777] hover:to-[#7c3aed]"
                          onClick={() => startUnfollow(unfollowAccounts, furiousMode, startFrom, skipAlreadyUnfollowed)}
                        >
                          <Rocket size={14} /> Start Auto-Run
                        </button>
                        <button
                          className="btn btn-ghost flex-1 justify-center"
                          onClick={() => setUnfollowTab("manual")}
                        >
                          Use Manual Instead
                        </button>
                      </>
                    )}
                    {unfollowState.status === "running" && (
                      <button
                        className="btn flex-1 justify-center bg-[#ef4444] text-white hover:bg-[#dc2626]"
                        onClick={stopUnfollow}
                      >
                        <X size={14} /> Stop
                      </button>
                    )}
                    {(unfollowState.status === "done" || unfollowState.status === "stopped" || unfollowState.status === "error" || unfollowState.blocked) && (
                      <>
                        <button
                          className="btn btn-primary flex-1 justify-center"
                          onClick={() => { resetUnfollow(); startUnfollow(unfollowAccounts, furiousMode, startFrom, skipAlreadyUnfollowed); }}
                        >
                          <Rocket size={14} /> Run Again
                        </button>
                        <button
                          className="btn btn-ghost"
                          onClick={() => setShowUnfollowDialog(false)}
                        >
                          Close
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts indicator */}
      <div className="fixed bottom-4 right-4 z-40">
        <button
          className="w-9 h-9 rounded-full border border-[#27272a] bg-[#18181b] text-[#52525b] flex items-center justify-center text-xs font-bold font-mono hover:border-[#6366f1] hover:text-[#6366f1] transition-colors backdrop-blur-lg"
          title="Keyboard shortcuts"
          onClick={() => {
            alert("J/K — Navigate pages\nS — Focus search\nA — Approve (in preview)\nR — Reject (in preview)\nEsc — Close preview");
          }}
        >
          ?
        </button>
      </div>
    </div>
  );
}


