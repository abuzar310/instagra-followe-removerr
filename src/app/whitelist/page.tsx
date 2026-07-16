"use client";

import { useState, useEffect, useMemo } from "react";
import { getWhitelist, removeFromWhitelist, clearWhitelist } from "@/lib/store";
import type { WhitelistEntry } from "@/lib/types";
import Avatar from "@/components/Avatar";
import { ShieldCheck, Search, Trash2, X } from "lucide-react";

export default function WhitelistPage() {
  const [list, setList] = useState<WhitelistEntry[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setList(getWhitelist());
    setLoading(false);
  }, []);

  const filtered = useMemo(() => {
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (w) => w.username.toLowerCase().includes(q) || w.full_name.toLowerCase().includes(q)
    );
  }, [list, search]);

  const handleRemove = (id: string) => {
    setList(removeFromWhitelist([id]));
  };

  const handleClearAll = () => {
    if (confirm(`Remove all ${list.length} accounts from the whitelist? They will appear in the review queue again on the next fetch.`)) {
      clearWhitelist();
      setList([]);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-white/5 rounded-lg" />
        <div className="h-64 bg-white/5 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Whitelist</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            {list.length === 0
              ? "Accounts you keep never show up in the review queue again"
              : `${list.length.toLocaleString()} kept account${list.length > 1 ? "s" : ""} — skipped on every fetch and import`}
          </p>
        </div>
        {list.length > 0 && (
          <button className="btn btn-ghost text-sm text-[#ef4444]" onClick={handleClearAll}>
            <Trash2 size={14} /> Clear whitelist
          </button>
        )}
      </div>

      {list.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ShieldCheck size={48} className="text-[#27272a] mb-4" />
          <h2 className="text-lg font-semibold text-white/60 mb-2">Whitelist is empty</h2>
          <p className="text-sm text-[#52525b] max-w-md">
            When you <strong className="text-[#ef4444]">reject</strong> an account in the Review Queue
            (= "keep following them"), it lands here automatically and will be skipped
            on all future fetches and imports.
          </p>
        </div>
      ) : (
        <>
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

          {/* Table */}
          {filtered.length === 0 ? (
            <div className="card p-12 text-center">
              <p className="text-sm text-[#52525b]">No accounts match this search.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#27272a]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#121214] border-b border-[#27272a]">
                    <th className="text-left px-3 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">Username</th>
                    <th className="text-left px-3 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider hidden sm:table-cell">Added</th>
                    <th className="px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((w) => (
                    <tr key={w.id} className="border-b border-[#27272a]/50 last:border-0 hover:bg-white/[0.015] transition-colors">
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <Avatar src={w.profile_pic_url} username={w.username} size={30} />
                          <div className="min-w-0">
                            <span className="font-medium text-white">@{w.username}</span>
                            {w.full_name && <span className="text-[#52525b] ml-1.5 text-xs hidden lg:inline">{w.full_name}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[#a1a1aa] hidden sm:table-cell">
                        {new Date(w.added_at).toLocaleDateString("en-IN", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          className="btn btn-ghost btn-sm p-1.5"
                          title="Remove from whitelist"
                          onClick={() => handleRemove(w.id)}
                        >
                          <X size={14} className="text-[#ef4444]" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="text-center text-xs text-[#52525b]">
            {filtered.length} of {list.length} shown
          </div>
        </>
      )}

      {/* Info card */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-white/80 mb-2">How the whitelist works</h3>
        <ul className="text-sm text-[#a1a1aa] space-y-1.5 leading-relaxed">
          <li>• Rejecting an account in the Review Queue adds it here automatically</li>
          <li>• Whitelisted accounts are skipped when you fetch via Connect or import a file</li>
          <li>• Removing an account here means it will show up in the queue again next fetch</li>
          <li>• Matching uses the Instagram profile ID (and username as fallback), so it survives renames</li>
        </ul>
      </div>
    </div>
  );
}
