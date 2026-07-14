"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useData } from "@/hooks/useData";
import {
  applyFilters, getDefaultFilters, exportCSV, exportJSON,
} from "@/lib/store";
import type { ReviewFilters, Follower } from "@/lib/types";
import {
  Users, Search, ArrowUpDown, CheckCircle, XCircle, ChevronLeft, ChevronRight,
  Download, MoreHorizontal, AlertTriangle, Eye, X,
} from "lucide-react";

const PER_PAGE = 50;

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
    updateFollower(id, { reviewed: true, approved: true });
  };

  const handleReject = (id: string) => {
    updateFollower(id, { reviewed: true, approved: false });
  };

  const handleReset = (id: string) => {
    updateFollower(id, { reviewed: false, approved: null });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Delete ${selectedIds.size} selected profiles?`)) {
      deleteFollowers(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  const openPreview = (f: Follower) => {
    setPreview(f);
    setNotesDraft(f.notes);
  };

  const saveNotes = () => {
    if (!preview) return;
    updateFollower(preview.id, { notes: notesDraft });
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
            {followers.length.toLocaleString()} profiles · {reviewedCount.toLocaleString()} reviewed · {filtered.length.toLocaleString()} shown
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
            <button className="btn btn-danger text-sm" onClick={handleBulkDelete}>
              Delete {selectedIds.size}
            </button>
          )}
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
                    <span className="font-medium text-white">@{f.username}</span>
                    {f.full_name && <span className="text-[#52525b] ml-1.5 text-xs hidden lg:inline">{f.full_name}</span>}
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

      {/* Preview Modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) { saveNotes(); setPreview(null); } }}
        >
          <div className="card w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-lg font-semibold text-white">@{preview.username}</h2>
                {preview.full_name && (
                  <p className="text-sm text-[#a1a1aa]">{preview.full_name}</p>
                )}
              </div>
              <button className="btn btn-ghost btn-sm p-1.5" onClick={() => { saveNotes(); setPreview(null); }}>
                <X size={16} />
              </button>
            </div>

            {/* Detail grid */}
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <div className="bg-[#121214] rounded-lg p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b] mb-0.5">Followers</div>
                <div className="text-base font-semibold text-white">{preview.followers_count.toLocaleString()}</div>
              </div>
              <div className="bg-[#121214] rounded-lg p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b] mb-0.5">Following</div>
                <div className="text-base font-semibold text-white">{preview.following_count.toLocaleString()}</div>
              </div>
              <div className="bg-[#121214] rounded-lg p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b] mb-0.5">Posts</div>
                <div className="text-base font-semibold text-white">{preview.posts_count.toLocaleString()}</div>
              </div>
              <div className="bg-[#121214] rounded-lg p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b] mb-0.5">Account Age</div>
                <div className="text-base font-semibold text-white">
                  {preview.account_age_days ? `${preview.account_age_days} days` : "Unknown"}
                </div>
              </div>
              <div className="bg-[#121214] rounded-lg p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b] mb-0.5">Private</div>
                <div className="text-base font-semibold text-white">{preview.is_private ? "Yes" : "No"}</div>
              </div>
              <div className="bg-[#121214] rounded-lg p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#52525b] mb-0.5">Verified</div>
                <div className="text-base font-semibold text-white">{preview.is_verified ? "Yes" : "No"}</div>
              </div>
            </div>

            {/* Suspicion reasons */}
            {preview.suspicion_reasons.length > 0 && (
              <div className="bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.15)] rounded-lg p-4 mb-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-[#ef4444] mb-2">
                  <AlertTriangle size={12} className="inline mr-1" />
                  Suspicion Reasons — Score {preview.suspicion_score}/100
                </div>
                <ul className="space-y-1">
                  {preview.suspicion_reasons.map((reason, i) => (
                    <li key={i} className="text-sm text-[#ef4444]/80">• {reason}</li>
                  ))}
                </ul>
              </div>
            )}

            {preview.suspicion_reasons.length === 0 && (
              <div className="bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.15)] rounded-lg p-4 mb-4">
                <p className="text-sm text-[#22c55e]">No suspicion flags raised for this account.</p>
              </div>
            )}

            {/* Biography */}
            {preview.biography && (
              <div className="bg-[#121214] rounded-lg p-3 mb-4 text-sm text-[#a1a1aa] italic">
                "{preview.biography}"
              </div>
            )}

            {/* Notes */}
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#52525b] mb-1.5">Notes</label>
              <textarea
                className="input w-full resize-y min-h-[60px]"
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                onBlur={saveNotes}
                placeholder="Add a note about this account..."
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {(!preview.reviewed || preview.approved === false) && (
                <button className="btn btn-primary flex-1 justify-center" onClick={() => { handleApprove(preview.id); setPreview(null); }}>
                  <CheckCircle size={14} /> Approve
                </button>
              )}
              {(!preview.reviewed || preview.approved === true) && (
                <button className="btn btn-danger flex-1 justify-center" onClick={() => { handleReject(preview.id); setPreview(null); }}>
                  <XCircle size={14} /> Reject
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => { saveNotes(); setPreview(null); }}>
                Close
              </button>
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

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
