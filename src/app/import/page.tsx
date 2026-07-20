"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useData } from "@/hooks/useData";
import type { AppBackup } from "@/lib/store";
import { Upload, FileText, X, AlertCircle, Database, Download, Upload as UploadIcon } from "lucide-react";

export default function ImportPage() {
  const router = useRouter();
  const { importFollowers, restore } = useData();
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<Record<string, any>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [importing, setImporting] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const handleFile = useCallback((file: File) => {
    setError("");
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "csv") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        parseCSV(text);
      };
      reader.readAsText(file);
    } else if (ext === "json") {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        parseJSON(text);
      };
      reader.readAsText(file);
    } else {
      setError("Unsupported format. Please upload a CSV or JSON file.");
    }
  }, []);

  const parseCSV = (text: string) => {
    try {
      // Dynamic import of papaparse
      import("papaparse").then((Papa) => {
        const result = Papa.default.parse(text, {
          header: true,
          skipEmptyLines: true,
          transformHeader: (h: string) => h.trim(),
        });
        if (result.errors.length > 0 && result.data.length === 0) {
          setError("Failed to parse CSV. Check the format.");
          return;
        }
        if (result.data.length === 0) {
          setError("CSV file has no data rows.");
          return;
        }
        setParsed(result.data as Record<string, any>[]);
      });
    } catch {
      setError("Failed to parse CSV. Check the format and try again.");
    }
  };

  const parseJSON = (text: string) => {
    try {
      const data = JSON.parse(text);
      const arr = Array.isArray(data) ? data : (data.users || data.followers || data.data || []);
      if (!Array.isArray(arr) || arr.length === 0) {
        setError("JSON file has no data array.");
        return;
      }
      setParsed(arr as Record<string, any>[]);
    } catch {
      setError("Failed to parse JSON. Check the format and try again.");
    }
  };

  const handlePaste = () => {
    setError("");
    const text = pasteText.trim();
    if (!text) { setError("Paste some data first."); return; }
    if (text.startsWith("[") || text.startsWith("{")) {
      parseJSON(text);
    } else if (text.includes("\n")) {
      parseCSV(text);
    } else {
      setError("Could not detect format. Make sure it's valid JSON or CSV.");
    }
  };

  const handleImport = () => {
    if (!parsed || parsed.length === 0) return;
    setImporting(true);
    const result = importFollowers(parsed, fileName);
    setImporting(false);
    if (result.count > 0) {
      router.push("/review");
    }
  };

  const previewFields = parsed && parsed.length > 0 ? Object.keys(parsed[0]).slice(0, 7) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white">Import Data</h1>
          <p className="text-sm text-[#a1a1aa] mt-0.5">
            Upload a CSV or JSON export from Instagram to analyze your followers.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2.5 bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] rounded-xl p-4 text-sm text-[#ef4444]">
          <AlertCircle size={16} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!parsed ? (
        <>
          {/* Dropzone */}
          <div
            className={`relative border-2 border-dashed rounded-2xl p-16 text-center cursor-pointer transition-all ${
              dragOver
                ? "border-[#6366f1] bg-[rgba(99,102,241,0.05)]"
                : "border-[#27272a] hover:border-[#52525b] bg-[#121214]"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => inputRef.current?.click()}
          >
            <Upload size={40} className="mx-auto mb-4 text-[#52525b]" />
            <div className="text-base font-medium text-white/60 mb-1">Drop your export file here</div>
            <div className="text-sm text-[#52525b] mb-4">or click to browse — CSV or JSON</div>
            <div className="flex justify-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono bg-[#18181b] text-[#a1a1aa] border border-[#27272a]">CSV</span>
              <span className="px-3 py-1 rounded-full text-xs font-mono bg-[#18181b] text-[#a1a1aa] border border-[#27272a]">JSON</span>
            </div>
            <input ref={inputRef} type="file" accept=".csv,.json" style={{ display: "none" }}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>

          {/* Paste toggle */}
          <div className="text-center">
            <button className="btn btn-ghost text-sm" onClick={() => setPasteMode(!pasteMode)}>
              {pasteMode ? "← Use file upload" : "Or paste your data"}
            </button>
          </div>

          {pasteMode && (
            <div className="space-y-3">
              <textarea
                placeholder="Paste CSV or JSON data here..."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                className="input w-full min-h-[160px] resize-y font-mono text-sm"
              />
              <button className="btn btn-primary" onClick={handlePaste}>Parse Data</button>
            </div>
          )}

          {/* Format guide */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-white/80 mb-2">Expected Format</h3>
            <p className="text-sm text-[#a1a1aa] leading-relaxed">
              Instagram exports typically include fields like{" "}
              <code className="text-xs bg-[#1f1f23] px-1.5 py-0.5 rounded text-white/60">username</code>,{" "}
              <code className="text-xs bg-[#1f1f23] px-1.5 py-0.5 rounded text-white/60">followers_count</code>,{" "}
              <code className="text-xs bg-[#1f1f23] px-1.5 py-0.5 rounded text-white/60">following_count</code>,{" "}
              <code className="text-xs bg-[#1f1f23] px-1.5 py-0.5 rounded text-white/60">posts_count</code>.
              The tool maps common field name variations automatically.
            </p>
            <p className="text-sm text-[#52525b] mt-2">
              Missing fields are treated as zeros or false — you can adjust suspicion rules afterwards.
            </p>
          </div>

          {/* Restore Backup */}
          <div className="border-t border-[#27272a] pt-6 mt-6">
            <h3 className="text-sm font-semibold text-white/80 mb-2">Restore Backup</h3>
            <p className="text-sm text-[#a1a1aa] mb-4">
              Lost your data after closing the app? Upload a backup file you downloaded earlier to restore everything.
            </p>
            <RestoreSection onRestore={restore} />
          </div>
        </>
      ) : (
        /* Preview */
        <div>
          <div className="card p-5 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-base font-semibold text-white">Preview</h3>
                <p className="text-sm text-[#a1a1aa] mt-0.5">
                  {parsed.length.toLocaleString()} profiles found in {fileName}
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn btn-ghost" onClick={() => { setParsed(null); setFileName(""); }}>
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={importing} onClick={handleImport}>
                  {importing ? "Importing..." : `Import ${parsed.length.toLocaleString()} Profiles`}
                </button>
              </div>
            </div>
          </div>

          {/* Table preview */}
          <div className="overflow-x-auto rounded-xl border border-[#27272a]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#121214] border-b border-[#27272a]">
                  {previewFields.map((f) => (
                    <th key={f} className="text-left px-4 py-3 text-xs font-medium text-[#52525b] uppercase tracking-wider">
                      {f.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsed.slice(0, 20).map((row, i) => (
                  <tr key={i} className="border-b border-[#27272a]/50 last:border-0 hover:bg-white/[0.015]">
                    {previewFields.map((f) => (
                      <td key={f} className="px-4 py-3 text-white/70 truncate max-w-[180px]">
                        {String(row[f] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {parsed.length > 20 && (
              <div className="text-center py-3 text-sm text-[#52525b] border-t border-[#27272a]">
                Showing 20 of {parsed.length.toLocaleString()} rows
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Restore Backup Section ── */
function RestoreSection({ onRestore }: { onRestore: (backup: AppBackup) => { followers: number; rules: number; batches: number; whitelist: number } }) {
  const [status, setStatus] = useState<{ type: "ok" | "err" | "info"; msg: string } | null>(null);
  const [restoring, setRestoring] = useState(false);

  const handleRestore = (file: File) => {
    setStatus(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      try {
        const data = JSON.parse(text);

        // Validate it's a proper backup
        if (!data.version || !data.followers) {
          setStatus({ type: "err", msg: "This doesn't look like a valid backup file. Make sure you're using a file exported from the Backup button." });
          return;
        }

        setRestoring(true);
        const result = onRestore(data);
        setStatus({
          type: "ok",
          msg: `Restored successfully! ${result.followers} profiles, ${result.rules} rules, ${result.batches} imports, ${result.whitelist} whitelisted accounts.`,
        });
        setRestoring(false);
      } catch {
        setStatus({ type: "err", msg: "Invalid JSON file. Please select a valid backup file." });
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="card p-5 border border-dashed border-[#27272a]">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex-1">
          <p className="text-sm text-[#a1a1aa]">
            Choose a <code className="text-xs bg-[#1f1f23] px-1.5 py-0.5 rounded text-white/60">ifr-backup-*.json</code> file to restore.
          </p>
          <p className="text-xs text-[#52525b] mt-1">
            ⚠️ This will overwrite ALL current data.
          </p>
        </div>
        <label className="btn btn-ghost text-sm cursor-pointer">
          <UploadIcon size={14} />
          {restoring ? "Restoring..." : "Restore Backup"}
          <input
            type="file"
            accept=".json"
            className="hidden"
            disabled={restoring}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleRestore(f);
            }}
          />
        </label>
      </div>
      {status && (
        <div
          className={`mt-3 px-4 py-2.5 rounded-lg text-sm ${
            status.type === "ok"
              ? "bg-[rgba(34,197,94,0.1)] border border-[rgba(34,197,94,0.2)] text-[#22c55e]"
              : status.type === "err"
              ? "bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.2)] text-[#ef4444]"
              : "bg-[rgba(59,130,246,0.1)] border border-[rgba(59,130,246,0.2)] text-[#3b82f6]"
          }`}
        >
          {status.msg}
        </div>
      )}
    </div>
  );
}
