"use client";

import { useData } from "@/hooks/useData";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { Upload, Users, AlertTriangle, CheckCircle, Activity, Database, LogIn } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { followers, batches, stats, loading, clearAll, refresh } = useData();

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-48 bg-white/5 rounded-lg" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-white/5 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-white/5 rounded-xl" />
      </div>
    );
  }

  const isEmpty = followers.length === 0;

  // Score distribution for chart
  const buckets = [
    { range: "0–19", min: 0, max: 19, color: "#22c55e" },
    { range: "20–39", min: 20, max: 39, color: "#eab308" },
    { range: "40–59", min: 40, max: 59, color: "#f97316" },
    { range: "60–79", min: 60, max: 79, color: "#ef4444" },
    { range: "80–100", min: 80, max: 100, color: "#dc2626" },
  ];
  const chartData = buckets.map((b) => ({
    range: b.range,
    count: followers.filter((f) => f.suspicion_score >= b.min && f.suspicion_score <= b.max).length,
    color: b.color,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Dashboard</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            {isEmpty
              ? "Connect Instagram to get started"
              : `${followers.length.toLocaleString()} profiles · ${stats.flagged} flagged · ${stats.reviewed} reviewed`
            }
          </p>
        </div>
        <div className="flex gap-2">
          {!isEmpty && (
            <>
              <Link href="/review" className="btn btn-primary text-sm">
                Review Queue
              </Link>
              <button onClick={clearAll} className="btn btn-ghost text-sm">
                Clear Data
              </button>
            </>
          )}
          <button onClick={refresh} className="btn btn-ghost text-sm">
            Refresh
          </button>
        </div>
      </div>

      {isEmpty ? (
        /* ── Empty State ── */
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Database size={48} className="text-[#27272a] mb-4" />
          <h2 className="text-lg font-semibold text-white/60 mb-2">No data imported yet</h2>
          <p className="text-sm text-[#52525b] max-w-sm mb-6">
            Connect your Instagram account or import a CSV/JSON export to analyze your followers.
          </p>
          <div className="flex gap-3">
            <Link href="/connect" className="btn btn-primary">
              <LogIn size={16} />
              Connect Instagram
            </Link>
            <Link href="/import" className="btn btn-ghost">
              <Upload size={16} />
              Import File
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* ── Stats Grid ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="card p-4">
              <div className="flex items-center gap-2 text-[#a1a1aa] text-xs font-medium uppercase tracking-wider mb-2">
                <Users size={14} /> Total
              </div>
              <div className="text-2xl font-bold text-white">{stats.total.toLocaleString()}</div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 text-[#a1a1aa] text-xs font-medium uppercase tracking-wider mb-2">
                <AlertTriangle size={14} /> Flagged
              </div>
              <div className="text-2xl font-bold text-[#eab308]">{stats.flagged}</div>
              <div className="text-xs text-[#52525b] mt-0.5">
                {stats.total > 0 ? `${Math.round((stats.flagged / stats.total) * 100)}% of total` : ""}
              </div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 text-[#a1a1aa] text-xs font-medium uppercase tracking-wider mb-2">
                <Activity size={14} /> High Risk
              </div>
              <div className="text-2xl font-bold text-[#ef4444]">{stats.highRisk}</div>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 text-[#a1a1aa] text-xs font-medium uppercase tracking-wider mb-2">
                <CheckCircle size={14} /> Reviewed
              </div>
              <div className="text-2xl font-bold text-[#22c55e]">{stats.reviewed}</div>
              <div className="text-xs text-[#52525b] mt-0.5">
                {stats.total - stats.reviewed > 0 ? `${stats.total - stats.reviewed} remaining` : "All done"}
              </div>
            </div>
          </div>

          {/* ── Score Distribution Chart ── */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white/80 mb-4">Suspicion Score Distribution</h3>
            {chartData.every((b) => b.count === 0) ? (
              <div className="flex items-center justify-center h-48 text-sm text-[#52525b]">
                No scores calculated yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                  <XAxis dataKey="range" tick={{ fill: "#52525b", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#52525b", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={false}
                    contentStyle={{ background: "#18181b", border: "1px solid #27272a", borderRadius: 8, fontSize: 13 }}
                    labelStyle={{ color: "#a1a1aa" }}
                  />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* ── Bottom Grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Quick Stats */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white/80 mb-3">Account Breakdown</h3>
              <div className="space-y-2.5">
                <div className="flex justify-between text-sm">
                  <span className="text-[#a1a1aa]">Average suspicion score</span>
                  <span className="font-medium text-white">{stats.avgScore}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#a1a1aa]">Private accounts</span>
                  <span className="font-medium text-white">{stats.privateCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#a1a1aa]">Verified accounts</span>
                  <span className="font-medium text-white">{stats.verifiedCount}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#a1a1aa]">Zero posts</span>
                  <span className="font-medium text-white">{stats.zeroPosts}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#a1a1aa]">No profile picture</span>
                  <span className="font-medium text-white">{stats.noProfilePic}</span>
                </div>
              </div>
            </div>

            {/* Recent Imports */}
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-white/80 mb-3">Import History</h3>
              {batches.length === 0 ? (
                <div className="text-sm text-[#52525b] py-8 text-center">No imports yet.</div>
              ) : (
                <div className="space-y-2">
                  {batches.slice(0, 5).map((b) => (
                    <div key={b.id} className="flex justify-between items-center text-sm">
                      <div className="min-w-0">
                        <div className="text-white/70 truncate">{b.filename}</div>
                        <div className="text-xs text-[#52525b]">
                          {new Date(b.created_at).toLocaleDateString("en-IN", {
                            day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <span className="badge badge-blue shrink-0">{b.count} profiles</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
