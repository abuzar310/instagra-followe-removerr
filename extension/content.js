/* ── Content Script: runs on instagram.com ──
 * Handles fetch and unfollow operations via Instagram's internal API.
 * Communicates with the popup via chrome.runtime.sendMessage.
 */

if (window.__ifrContentLoaded) {
  // Already injected (popup re-injects on demand) — don't register twice.
} else {
window.__ifrContentLoaded = true;

const APP_ID = "936619743392459";

function csrf() {
  const m = document.cookie.match(/csrftoken=([^;]+)/);
  return m ? m[1] : "";
}

// ── Get current user ID ──
async function getUserId() {
  // Method 1: ds_user_id cookie — set for every logged-in session, zero API
  // calls so it can never be rate limited.
  const cookieMatch = document.cookie.match(/ds_user_id=(\d+)/);
  if (cookieMatch) return cookieMatch[1];

  // Method 2: HTML patterns anywhere in the page
  const html = document.documentElement.innerHTML;
  const patterns = [
    /"user_id":"(\d+)"/,
    /"pk":(\d+)/,
    /"viewerId":"(\d+)"/,
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return m[1];
  }

  // Method 3: Parse script tags — find "viewer" then look for "id" nearby
  try {
    const scripts = document.querySelectorAll('script');
    for (const script of scripts) {
      const text = script.textContent || '';
      const viewerStart = text.search(/"viewer"\s*:\s*\{/);
      if (viewerStart === -1) continue;
      const afterViewer = text.slice(viewerStart, viewerStart + 5000);
      const idMatch = afterViewer.match(/"id"\s*:\s*"(\d+)"/);
      if (idMatch) return idMatch[1];
    }
  } catch {}

  // Method 4 (last resort): Instagram API — only reached if cookies are
  // blocked and the page markup changed. Subject to rate limits.
  try {
    const r = await fetch("https://www.instagram.com/api/v1/users/web_profile_info/", {
      headers: { "x-ig-app-id": APP_ID, "x-csrftoken": csrf() },
    });
    const d = await r.json();
    if (d.data?.user?.id) return d.data.user.id;
  } catch {}

  throw new Error("Could not determine your user ID. Make sure you're logged in.");
}

// ── Message handler ──
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case "ping":
      sendResponse({ pong: true });
      return false;
    case "checkLogin":
      handleCheckLogin(sendResponse);
      return true;
    case "fetchData":
      handleFetchData(msg, sendResponse);
      return true;
    case "unfollow":
      handleUnfollow(msg, sendResponse);
      return true;
  }
});

// ── Check login (uses getUserId which has API + HTML + script tag fallbacks) ──
async function handleCheckLogin(sendResponse) {
  try {
    const userId = await getUserId();
    // Username purely cosmetic — not worth a second API call if getUserId
    // already fell through to HTML. Return empty, popup handles it fine.
    sendResponse({ loggedIn: true, userId, username: "" });
  } catch {
    sendResponse({ loggedIn: false });
  }
}

// ── Rate-limited fetch with retry + exponential backoff ──
async function rateLimitedFetch(url, options, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, options);
    const data = await res.json();

    // Success
    if (data.status !== "fail") return data;

    const msg = (data.message || "").toLowerCase();
    const isRateLimit =
      res.status === 429 ||
      msg.includes("please wait") ||
      msg.includes("too many") ||
      msg.includes("rate limit") ||
      msg.includes("try again later");

    if (!isRateLimit) {
      // Non-rate-limit failure — throw immediately
      throw new Error(data.message || "API returned fail");
    }

    if (attempt >= retries) {
      throw new Error("Instagram is still rate limiting after " + (retries + 1) + " attempts. " + (data.message || "Please wait 10-15 minutes and try again."));
    }

    // Exponential backoff: 60s → 120s → 240s → 480s → 960s
    const waitSeconds = 60 * Math.pow(2, attempt);
    const jitter = Math.random() * 30;
    const totalWait = (waitSeconds + jitter) * 1000;

    // Notify popup about the delay
    chrome.runtime.sendMessage({
      type: "rateLimited",
      waitSeconds: Math.round(totalWait / 1000),
      attempt: attempt + 1,
      maxAttempts: retries,
    });

    await new Promise(r => setTimeout(r, totalWait));
  }
}

async function fetchList(userId, kind, onProgress) {
  const items = [];
  let nextMaxId = null;
  for (let i = 0; i < 50; i++) {
    let url = `https://i.instagram.com/api/v1/friendships/${userId}/${kind}/?count=200`;
    if (nextMaxId) url += "&max_id=" + encodeURIComponent(nextMaxId);

    const data = await rateLimitedFetch(url, {
      headers: { "x-ig-app-id": APP_ID, "x-csrftoken": csrf() },
    });

    const users = data.users || [];
    items.push(...users);
    onProgress(items.length);
    nextMaxId = data.next_max_id || null;
    if (!nextMaxId) break;

    // Conservative delay between pages: 3-8 seconds to avoid rate limits
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
  }
  return items;
}

async function handleFetchData(msg, sendResponse) {
  const userId = msg.userId;
  if (!userId) {
    sendResponse({ error: "Not logged in" });
    return;
  }
  try {
    const followers = await fetchList(userId, "followers", (count) => {
      chrome.runtime.sendMessage({ type: "progress", kind: "followers", count });
    });
    const following = await fetchList(userId, "following", (count) => {
      chrome.runtime.sendMessage({ type: "progress", kind: "following", count });
    });
    sendResponse({
      success: true,
      data: {
        followers,
        following,
        followersCount: followers.length,
        followingCount: following.length,
        fetchedAt: new Date().toISOString(),
      },
    });
  } catch (e) {
    sendResponse({ success: false, error: e instanceof Error ? e.message : String(e) });
  }
}

async function handleUnfollow(msg, sendResponse) {
  const entries = msg.entries;
  if (!entries || entries.length === 0) {
    sendResponse({ error: "No entries provided" });
    return;
  }

  const results = [];
  const cycleMs = msg.cycleHours * 60 * 60 * 1000;
  const avgInterval = cycleMs / entries.length;
  const baseWait = Math.max(5000, Math.floor(avgInterval * 0.7));
  const jitterRange = Math.max(1000, Math.floor(avgInterval * 0.6));

  // Capture the viewer's own user ID from the ds_user_id cookie once
  const viewerId = (document.cookie.match(/ds_user_id=(\d+)/) || [])[1] || "";

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const delay = baseWait + Math.floor(Math.random() * jitterRange);
    if (i > 0) {
      await new Promise(r => setTimeout(r, delay));
    }
    try {
      const token = csrf();
      const url = `https://i.instagram.com/api/v1/friendships/destroy/${entry.profileId}/`;
      // Instagram requires the target user_id, csrf token, and viewer uid in the body
      const body = new URLSearchParams({
        user_id: String(entry.profileId),
        _csrftoken: token,
        _uid: viewerId,
      }).toString();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-ig-app-id": APP_ID,
          "x-csrftoken": token,
          "content-type": "application/x-www-form-urlencoded",
          "x-requested-with": "XMLHttpRequest",
          "referer": "https://www.instagram.com/",
          "origin": "https://www.instagram.com",
        },
        body,
      });
      const data = await res.json();
      if (res.ok && data.status === "ok") {
        results.push({ userId: entry.profileId, username: entry.username, success: true });
        chrome.runtime.sendMessage({ type: "unfollow_progress", current: i + 1, total: entries.length, username: entry.username, success: true });
      } else {
        const errMsg = data.message || data.error_type || "HTTP " + res.status;
        results.push({ userId: entry.profileId, username: entry.username, success: false, error: errMsg });
        chrome.runtime.sendMessage({ type: "unfollow_progress", current: i + 1, total: entries.length, username: entry.username, success: false, error: errMsg });
        if (res.status === 429 || res.status === 400 || errMsg.includes("rate") || errMsg.includes("spam")) {
          await new Promise(r => setTimeout(r, 120000 + Math.random() * 60000));
        }
      }
    } catch (e) {
      results.push({ userId: entry.profileId, username: entry.username, success: false, error: String(e) });
      chrome.runtime.sendMessage({ type: "unfollow_progress", current: i + 1, total: entries.length, username: entry.username, success: false, error: String(e) });
    }
  }

  sendResponse({ results, succeeded: results.filter(r => r.success).length, failed: results.filter(r => !r.success).length });
}

} // end injection guard
