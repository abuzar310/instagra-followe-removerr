/* ── DevTools Console Unfollow Script ──
 *
 * Generates a JS snippet the user pastes into Instagram's DevTools console.
 * The script runs INSIDE their browser (where they're already logged in) and
 * unfollows accounts one by one via Instagram's internal API.
 *
 * Usage:
 *   1. Approve accounts in the review queue, then go to the Unfollow page
 *   2. Click "Generate Script" and copy the generated script
 *   3. Go to instagram.com in Chrome/Firefox
 *   4. Open DevTools (F12) → Console tab
 *   5. Paste the script and press Enter
 *   6. Wait — the script logs progress as it runs (can take a while)
 *   7. When done, it copies results to clipboard — paste back in the app
 */

export function generateUnfollowScript(
  entries: { profileId: string; username: string }[],
  cycleHours: number = 6
): string {
  if (entries.length === 0) {
    return "// No accounts to unfollow — add some first!";
  }

  const entriesJson = JSON.stringify(entries);

  return `(async function unfollowIG() {
  const APP_ID = "936619743392459";
  const ENTRIES = ${entriesJson};
  const CYCLE_MS = ${cycleHours * 60 * 60 * 1000};
  const RESULTS = [];

  function csrf() {
    const m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? m[1] : "";
  }

  console.log("");
  console.log("========================================");
  console.log("🚀 INSTAGRAM UNFOLLOWER");
  console.log("Targets: " + ENTRIES.length + " accounts");
  console.log("Cycle window: " + ${cycleHours} + " hours");
  console.log("========================================");
  console.log("");

  // Calculate per-unfollow delay to spread across the cycle window
  const avgInterval = CYCLE_MS / ENTRIES.length;
  const baseWait = Math.max(5000, Math.floor(avgInterval * 0.7));
  const jitterRange = Math.max(1000, Math.floor(avgInterval * 0.6));
  const estMinutes = Math.round((ENTRIES.length * (baseWait + jitterRange / 2)) / 60000);

  console.log("⏱ Estimated time: ~" + estMinutes + " minutes");
  console.log("   Delay between unfollows: " + Math.round(baseWait / 1000) + "–" + Math.round((baseWait + jitterRange) / 1000) + " seconds");
  console.log("");

  // Confirm with user
  if (!confirm("Unfollow " + ENTRIES.length + " accounts? This will take ~" + estMinutes + " minutes.\\n\\nThe script will run in this tab — you can leave it open in the background.")) {
    console.log("❌ Cancelled by user");
    return;
  }

  // Grab viewer ID from the ds_user_id cookie once
  const VIEWER_ID = (document.cookie.match(/ds_user_id=(\\d+)/) || [])[1] || "";

  for (let i = 0; i < ENTRIES.length; i++) {
    const entry = ENTRIES[i];
    const progress = "[" + (i + 1) + "/" + ENTRIES.length + "]";

    // Update page title so user can see progress in the tab
    document.title = "Unfollow " + (i + 1) + "/" + ENTRIES.length + " — Instagram";

    // Random delay
    const delay = baseWait + Math.floor(Math.random() * jitterRange);
    if (i > 0) {
      const secs = Math.round(delay / 1000);
      const eta = new Date(Date.now() + (ENTRIES.length - i) * delay).toLocaleTimeString();
      console.log(progress + " ⏳ Waiting " + secs + "s (ETA: " + eta + ")...");
      await new Promise(r => setTimeout(r, delay));
    }

    // Unfollow — Instagram's API requires user_id, _csrftoken, and _uid in the body
    try {
      const token = csrf();
      const url = "https://i.instagram.com/api/v1/friendships/destroy/" + entry.profileId + "/";
      const body = new URLSearchParams({
        user_id: String(entry.profileId),
        _csrftoken: token,
        _uid: VIEWER_ID,
      }).toString();
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "x-ig-app-id": APP_ID,
          "x-csrftoken": token,
          "content-type": "application/x-www-form-urlencoded",
          "x-requested-with": "XMLHttpRequest",
          "referer": "https://www.instagram.com/",
          "origin": "https://www.instagram.com"
        },
        body: body
      });
      const data = await res.json();

      if (res.ok && data.status === "ok") {
        RESULTS.push({ userId: entry.profileId, username: entry.username, success: true });
        console.log(progress + " ✅ @" + entry.username + " — unfollowed");
      } else {
        // Check for rate limiting
        const errMsg = data.message || data.error_type || "HTTP " + res.status;
        RESULTS.push({ userId: entry.profileId, username: entry.username, success: false, error: errMsg });
        console.warn(progress + " ❌ @" + entry.username + " — " + errMsg);

        // If rate limited, wait longer
        if (res.status === 429 || res.status === 400 || errMsg.includes("rate") || errMsg.includes("spam")) {
          const wait = 120000 + Math.random() * 60000;
          console.warn("   ⏸ Rate limited — pausing " + Math.round(wait / 1000) + "s...");
          await new Promise(r => setTimeout(r, wait));
        }
      }
    } catch (e) {
      RESULTS.push({ userId: entry.profileId, username: entry.username, success: false, error: String(e) });
      console.error(progress + " ❌ @" + entry.username + " — " + String(e));
    }
  }

  document.title = "Unfollow Complete — Instagram";

  // Summary
  const succeeded = RESULTS.filter(r => r.success).length;
  const failed = RESULTS.filter(r => !r.success).length;
  console.log("");
  console.log("========================================");
  console.log("🎉 UNFOLLOW CYCLE COMPLETE!");
  console.log("   ✅ " + succeeded + " unfollowed");
  console.log("   ❌ " + failed + " failed");
  console.log("========================================");

  // Copy results to clipboard
  const output = JSON.stringify({ results: RESULTS, completedAt: new Date().toISOString(), succeeded, failed });
  try {
    await navigator.clipboard.writeText(output);
    console.log("📋 Results copied to clipboard! Paste them back in the app.");
  } catch {
    console.warn("⚠️ Clipboard copy failed. Copy this JSON manually:");
    console.log(output);
  }
  console.log("");
})();`;
}

/* ── Old Playwright-based API kept as reference ──
 * The console script above replaces the server-side approach that required
 * cookie injection into a headless Chromium browser. That approach was
 * unreliable because Instagram's anti-bot detection flags headless browsers.
 * Running the script in the user's real browser session is much more reliable.
 */
