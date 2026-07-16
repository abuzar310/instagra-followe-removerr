/* ── Popup Script ── */
let activeTab = "fetch";
let unfollowRunning = false;
let stopUnfollow = false;

/* Make sure the content script is alive in the tab. If the tab was opened
 * before the extension was installed/updated, the script isn't there yet —
 * that's the "Receiving end does not exist" error. Inject it on demand. */
async function ensureContentScript(tabId) {
  try {
    const pong = await chrome.tabs.sendMessage(tabId, { action: "ping" });
    if (pong?.pong) return;
  } catch {}
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  await new Promise(r => setTimeout(r, 150));
}

// ── Tab switching ──
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    activeTab = tab.dataset.tab;
    document.getElementById("tabFetch").classList.toggle("hidden", activeTab !== "fetch");
    document.getElementById("tabUnfollow").classList.toggle("hidden", activeTab !== "unfollow");
  });
});

// ── Check login state on open ──
checkLogin();

async function checkLogin() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes("instagram.com")) {
    setStatus("fetchStatus", "info", "Open instagram.com and log in to use this extension.");
    return;
  }
  try {
    await ensureContentScript(tab.id);
    const resp = await chrome.tabs.sendMessage(tab.id, { action: "checkLogin" });
    if (resp?.loggedIn) {
      document.getElementById("userInfo").textContent = `@${resp.username}`;
      document.getElementById("btnFetch").disabled = false;
    } else {
      setStatus("fetchStatus", "warn", "Not logged into Instagram. Log in and try again.");
    }
  } catch {
    setStatus("fetchStatus", "err", "Cannot reach the page. Reload the instagram.com tab (F5) and reopen this popup.");
  }
}

// ── Fetch Tab ──
document.getElementById("btnFetch").addEventListener("click", startFetch);

async function startFetch() {
  const btn = document.getElementById("btnFetch");
  btn.disabled = true;
  btn.textContent = "⏳ Fetching...";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  // Show progress UI
  document.getElementById("fetchStatus").classList.remove("hidden");
  document.getElementById("fetchProgress").classList.remove("hidden");
  setStatus("fetchStatus", "info", "Fetching followers...");

  // Listen for progress updates from content script
  const progressListener = (msg) => {
    if (msg.type === "rateLimited") {
      const s = msg.waitSeconds;
      const m = Math.floor(s / 60);
      const secs = s % 60;
      const timeStr = m > 0 ? `${m}m ${secs}s` : `${secs}s`;
      setStatus("fetchStatus", "warn", `⏳ Instagram rate limited (attempt ${msg.attempt}/${msg.maxAttempts}). Waiting ${timeStr}...`);
    } else if (msg.type === "progress") {
      if (msg.kind === "followers") {
        document.getElementById("followerCount").textContent = msg.count.toLocaleString();
      } else if (msg.kind === "following") {
        document.getElementById("followingCount").textContent = msg.count.toLocaleString();
      }
      // Update progress bar — rough estimate: followers first, then following (50% each)
      const fc = parseInt(document.getElementById("followerCount").textContent.replace(/,/g, ""));
      const fwc = parseInt(document.getElementById("followingCount").textContent.replace(/,/g, ""));
      const total = fc + fwc;
      const max = 50000; // upper bound
      const pct = Math.min(100, Math.round((total / max) * 100));
      document.getElementById("fetchProgressFill").style.width = pct + "%";
    }
  };
  chrome.runtime.onMessage.addListener(progressListener);

  try {
    await ensureContentScript(tab.id);
    // First get userId
    const loginResp = await chrome.tabs.sendMessage(tab.id, { action: "checkLogin" });
    if (!loginResp?.loggedIn) throw new Error("Not logged in");

    // Fetch data
    const resp = await chrome.tabs.sendMessage(tab.id, { action: "fetchData", userId: loginResp.userId });
    if (!resp.success) throw new Error(resp.error);

    // Download as JSON
    const blob = new Blob([JSON.stringify(resp.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url,
      filename: `instagram-data-${loginResp.username || "me"}.json`,
      saveAs: true,
    });
    URL.revokeObjectURL(url);

    setStatus("fetchStatus", "ok", `✅ Done! ${resp.data.followersCount} followers, ${resp.data.followingCount} following downloaded. Import the JSON file in the app.`);
    document.getElementById("fetchProgressFill").style.width = "100%";
  } catch (e) {
    setStatus("fetchStatus", "err", "❌ " + friendlyError(e));
  } finally {
    chrome.runtime.onMessage.removeListener(progressListener);
    btn.disabled = false;
    btn.textContent = "🔍 Start Fetch";
  }
}

// ── Unfollow Tab ──
document.getElementById("queueInput").addEventListener("input", () => {
  const val = document.getElementById("queueInput").value.trim();
  document.getElementById("btnUnfollow").disabled = !val;
});

document.getElementById("btnUnfollow").addEventListener("click", startUnfollow);
document.getElementById("btnStopUnfollow").addEventListener("click", stopUnfollowAction);

function addLog(msg, type = "info") {
  const log = document.getElementById("unfollowLog");
  const line = document.createElement("div");
  line.className = type;
  line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

async function startUnfollow() {
  const input = document.getElementById("queueInput").value.trim();
  let entries;
  try {
    entries = JSON.parse(input);
    if (!Array.isArray(entries)) throw new Error("Not an array");
  } catch {
    addLog("Invalid JSON — paste the queue from the app", "error");
    return;
  }

  if (entries.length === 0) {
    addLog("Queue is empty", "error");
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  unfollowRunning = true;
  stopUnfollow = false;
  document.getElementById("btnUnfollow").disabled = true;
  document.getElementById("btnStopUnfollow").disabled = false;
  document.getElementById("unfollowStatus").classList.remove("hidden");
  document.getElementById("unfollowProgress").classList.remove("hidden");
  document.getElementById("unfollowLog").innerHTML = "";
  document.getElementById("unfollowProgressText").textContent = `0 / ${entries.length}`;
  document.getElementById("unfollowDoneCount").textContent = "0";
  document.getElementById("unfollowProgressFill").style.width = "0%";
  setStatus("unfollowStatus", "info", `Unfollowing ${entries.length} accounts over ~6 hours...`);

  addLog(`Starting unfollow for ${entries.length} accounts...`, "info");

  // Listen for progress updates
  const progressListener = (msg) => {
    if (msg.type === "unfollow_progress") {
      document.getElementById("unfollowProgressText").textContent = `${msg.current} / ${msg.total}`;
      const pct = Math.round((msg.current / msg.total) * 100);
      document.getElementById("unfollowProgressFill").style.width = pct + "%";
      document.getElementById("unfollowDoneCount").textContent = msg.success
        ? parseInt(document.getElementById("unfollowDoneCount").textContent) + 0 // counted at end
        : parseInt(document.getElementById("unfollowDoneCount").textContent);
      const icon = msg.success ? "✅" : "❌";
      const detail = msg.success ? "" : ` — ${msg.error}`;
      addLog(`${icon} @${msg.username}${detail}`, msg.success ? "success" : "error");
    }
  };
  chrome.runtime.onMessage.addListener(progressListener);

  try {
    await ensureContentScript(tab.id);
    const resp = await chrome.tabs.sendMessage(tab.id, {
      action: "unfollow",
      entries,
      cycleHours: 6,
    });

    if (!resp) {
      addLog("No response from page — refresh instagram.com and try again", "error");
      return;
    }

    document.getElementById("unfollowDoneCount").textContent = resp.succeeded;
    document.getElementById("unfollowProgressFill").style.width = "100%";

    addLog(`✅ Complete: ${resp.succeeded} unfollowed, ${resp.failed} failed`, "info");

    // Download results
    const blob = new Blob([JSON.stringify(resultsPayload(resp), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    await chrome.downloads.download({
      url,
      filename: `unfollow-results.json`,
      saveAs: true,
    });
    URL.revokeObjectURL(url);

    setStatus("unfollowStatus", "ok", `✅ ${resp.succeeded} unfollowed, ${resp.failed} failed. Import the results in the app.`);
  } catch (e) {
    addLog("Error: " + friendlyError(e), "error");
    setStatus("unfollowStatus", "err", "❌ " + friendlyError(e));
  } finally {
    chrome.runtime.onMessage.removeListener(progressListener);
    unfollowRunning = false;
    document.getElementById("btnUnfollow").disabled = false;
    document.getElementById("btnStopUnfollow").disabled = true;
  }
}

function resultsPayload(resp) {
  return {
    results: resp.results || [],
    completedAt: new Date().toISOString(),
    succeeded: resp.succeeded || 0,
    failed: resp.failed || 0,
  };
}

function stopUnfollowAction() {
  stopUnfollow = true;
  addLog("Stopping after current operation...", "warn");
  document.getElementById("btnStopUnfollow").disabled = true;
}

// ── Helpers ──
function friendlyError(e) {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("Receiving end does not exist") || msg.includes("Could not establish connection")) {
    return "Page connection lost. Reload the instagram.com tab (F5) and try again.";
  }
  return msg;
}

function setStatus(id, type, msg) {
  const el = document.getElementById(id);
  el.className = `status ${type}`;
  el.textContent = msg;
  el.classList.remove("hidden");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}
