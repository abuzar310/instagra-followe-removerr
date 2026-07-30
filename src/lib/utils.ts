/**
 * Trigger a file download in the browser.
 * Works for CSV, JSON, and any text-based content type.
 */
export function downloadFile(content: string, filename: string, mime: string) {
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

/**
 * Get the absolute path to a script in the scripts/ directory.
 * Uses dynamic string concat (not path.join) to prevent Next.js Turbopack
 * from statically tracing the path and trying to bundle runtime scripts.
 */
export function getScriptPath(name: string): string {
  const base = process.cwd()
  return base + "/scripts/" + name
}
