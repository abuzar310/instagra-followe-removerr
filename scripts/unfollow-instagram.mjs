#!/usr/bin/env node

/**
 * Instagram Unfollower
 * =====================
 *
 * Uses Playwright to unfollow accounts through a REAL browser
 * with your live Instagram session. Works alongside the fetch
 * script — you import the fetched data into the app, review
 * accounts, then use this script to unfollow them.
 *
 * Usage:
 *   node scripts/unfollow-instagram.mjs <profiles-file>
 *
 * Where <profiles-file> is a JSON file with an array of profiles:
 *   [
 *     { "profileId": "123456789", "username": "someuser" },
 *     ...
 *   ]
 *
 * You can also pass individual usernames:
 *   node scripts/unfollow-instagram.mjs username1 username2 username3
 *
 * Or create a file with one username per line:
 *   node scripts/unfollow-instagram.mjs --from-file usernames.txt
 *
 * Features:
 *   - Shares session with the fetch script (log in once!)
 *   - Human-like delays between unfollows (spread over hours)
 *   - Rate limit detection with auto-retry
 *   - Saves progress — safe to interrupt and resume
 */

import { chromium } from "playwright";
import { createInterface } from "readline";
import { writeFileSync, readFileSync, existsSync, mkdtempSync, rmSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = join(__dirname, ".instagram-session.json");
const PROGRESS_FILE = join(__dirname, ".unfollow-progress.json");
const APP_ID = "936619743392459";

// ── Helpers ──

function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${msg}`);
}

function saveSession(cookies) {
  writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
}

function loadSession() {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    return JSON.parse(readFileSync(SESSION_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function ask(query) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (a) => { rl.close(); resolve(a); }));
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log("");
    console.log("Instagram Unfollower");
    console.log("");
    console.log("Usage:");
    console.log("  node scripts/unfollow-instagram.mjs <file.json>");
    console.log("  node scripts/unfollow-instagram.mjs username1 username2 ...");
    console.log("  node scripts/unfollow-instagram.mjs --from-file usernames.txt");
    console.log("");
    console.log("JSON file format:");
    console.log('  [{ "profileId": "123", "username": "user1" }, ...]');
    console.log("");
    process.exit(0);
  }

  // ── Parse input ──
  let profiles = [];

  if (args[0] === "--from-file" && args[1]) {
    const text = readFileSync(args[1], "utf-8");
    profiles = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((u) => ({ profileId: "", username: u }));
  } else if (args[0].endsWith(".json")) {
    const raw = readFileSync(args[0], "utf-8");
    const data = JSON.parse(raw);
    profiles = Array.isArray(data) ? data : data.profiles || data.results || [];
  } else {
    profiles = args.map((u) => ({ profileId: "", username: u }));
  }

  if (profiles.length === 0) {
    console.log("❌ No profiles to unfollow.");
    process.exit(1);
  }

  // Try to look up profileIds from the saved data file
  const dataFile = join(__dirname, "instagram-data.json");
  if (existsSync(dataFile)) {
    const data = JSON.parse(readFileSync(dataFile, "utf-8"));
    const allUsers = [...(data.followers || []), ...(data.following || []), ...(data.nonFollowbacks || [])];
    const userMap = new Map();
    for (const u of allUsers) {
      if (u.username) {
        userMap.set(u.username.toLowerCase(), String(u.pk || u.id || ""));
      }
    }
    for (const p of profiles) {
      if (!p.profileId && userMap.has(p.username.toLowerCase())) {
        p.profileId = userMap.get(p.username.toLowerCase());
      }
    }
  }

  const withIds = profiles.filter((p) => p.profileId);
  const withoutIds = profiles.filter((p) => !p.profileId);

  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║           Instagram Unfollower Bot           ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
  console.log(`   🎯 ${profiles.length} accounts to unfollow`);

  if (withoutIds.length > 0) {
    console.log(`   ⚠️  ${withoutIds.length} without profileId — will look up by username`);
  }
  console.log("");

  // ── Load session / launch browser ──
  const savedSession = loadSession();
  if (!savedSession) {
    console.log("❌ No saved session found. Run the fetch script first to log in:");
    console.log("   node scripts/fetch-instagram.mjs");
    console.log("");
    process.exit(1);
  }

  // Detect browser (Brave or Chrome)
  const browserInfo = getBrowserInfo();
  const browserName = browserInfo ? browserInfo.name : "Chrome";
  log(`🚀 Launching with ${browserName}...`);

  const profileDir = mkdtempSync(join(tmpdir(), "ig-unfollow-"));
  
  const launchOpts = {
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=ChromeWhatsNewUI",
    ],
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  };

  if (browserInfo && browserInfo.name === "Brave") {
    launchOpts.executablePath = getAvailableBravePath(browserInfo);
  } else {
    launchOpts.channel = "chrome";
  }

  const context = await chromium.launchPersistentContext(profileDir, launchOpts);

  await context.addCookies(savedSession);
  log("🍪 Session loaded.");

  const page = await context.newPage();

  // Hide automation from Instagram
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  // ── Verify login ──
  log("🌐 Navigating to instagram.com...");
  await page.goto("https://www.instagram.com/", { waitUntil: "networkidle", timeout: 60000 });

  // Check if session is still valid
  const url = page.url();
  if (url.includes("accounts/login") || url.includes("login")) {
    log("❌ Session expired! Please log in again.");
    log("   Run: node scripts/fetch-instagram.mjs");
    console.log("   (It will detect the expired session and let you log in again.)");
    await context.close();
    try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
    process.exit(1);
  }

  log("✅ Session valid!");

  // ── Spread unfollows across a time window ──
  const CYCLE_HOURS = 36; // Spread across 36 hours by default (safe for 930 accounts)
  const CYCLE_MS = CYCLE_HOURS * 60 * 60 * 1000;
  const avgInterval = CYCLE_MS / profiles.length;
  const baseWait = Math.max(8000, Math.floor(avgInterval * 0.7));
  const jitterRange = Math.max(2000, Math.floor(avgInterval * 0.6));
  const totalEstMin = Math.round((profiles.length * (baseWait + jitterRange / 2)) / 60000);
  const totalEstHours = Math.round(totalEstMin / 60 * 10) / 10;

  // ── Check for saved progress ──
  let completed = 0;
  const savedProgress = loadProgress();
  if (savedProgress && savedProgress.profiles) {
    const existingCount = savedProgress.profiles.filter((p) => p.done).length;
    if (existingCount > 0) {
      log(`📋 Found saved progress: ${existingCount}/${savedProgress.profiles.length} already done.`);
      const answer = await ask("   Resume from where you left off? (Y/n): ");
      if (answer.toLowerCase() !== "n") {
        completed = existingCount;
        // Merge done status back
        const doneSet = new Set(
          savedProgress.profiles.filter((p) => p.done).map((p) => p.username)
        );
        for (const p of profiles) {
          if (doneSet.has(p.username)) p._done = true;
        }
      }
    }
  }

  console.log("");
  console.log(`   ⏱ Estimated time: ~${totalEstHours > 1 ? totalEstHours + " hours" : totalEstMin + " minutes"}`);
  console.log(`   ⏸ Delay between unfollows: ${Math.round(baseWait / 1000)}-${Math.round((baseWait + jitterRange) / 1000)}s`);
  console.log("");

  // ── Unfollow loop ──
  const results = [];

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];
    if (p._done) continue; // Skip already completed

    const progress = `[${i + 1}/${profiles.length}]`;

    // Update tab title so user can see progress
    try {
      await page.evaluate(
        (n, total) => { document.title = `Unfollow ${n}/${total} — Instagram`; },
        i + 1,
        profiles.length
      );
    } catch {}

    // Delay between unfollows
    if (i > 0 || completed > 0) {
      const delay = baseWait + Math.floor(Math.random() * jitterRange);
      const eta = new Date(Date.now() + (profiles.length - i) * (baseWait + jitterRange / 2)).toLocaleTimeString();
      const secs = Math.round(delay / 1000);
      log(`${progress} ⏳ Waiting ${secs}s (ETA: ${eta})...`);
      await new Promise((r) => setTimeout(r, delay));
    }

    // Look up profileId if missing
    let profileId = p.profileId;
    if (!profileId) {
      log(`${progress} 🔍 Looking up @${p.username}...`);
      profileId = await lookupProfileId(page, p.username);
      if (!profileId) {
        log(`${progress} ❌ @${p.username} — could not find profile`);
        results.push({ username: p.username, success: false, error: "Profile not found" });
        continue;
      }
    }

    // Unfollow
    log(`${progress} 🚫 Unfollowing @${p.username}...`);
    const result = await unfollowAccount(page, profileId, p.username);
    results.push(result);

    if (result.success) {
      log(`${progress} ✅ @${p.username} unfollowed`);
    } else {
      log(`${progress} ❌ @${p.username} — ${result.error}`);
    }

    // Save progress periodically
    saveProgress({
      profiles: profiles.map((pp) => ({
        username: pp.username,
        profileId: pp.profileId,
        done: pp._done || pp === p,
      })),
      results,
      lastUpdated: new Date().toISOString(),
    });
  }

  // ── Summary ──
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║              ✅ UNFOLLOW COMPLETE!           ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
  console.log(`   ✅ ${succeeded} unfollowed`);
  console.log(`   ❌ ${failed} failed`);
  console.log("");

  if (failed > 0) {
    console.log("   Failed accounts:");
    for (const r of results.filter((r) => !r.success)) {
      console.log(`     ❌ @${r.username}: ${r.error}`);
    }
    console.log("");
  }

  // Save final results
  const outputFile = join(__dirname, "unfollow-results.json");
  writeFileSync(
    outputFile,
    JSON.stringify({ results, succeeded, failed, completedAt: new Date().toISOString() }, null, 2)
  );
  log(`💾 Results saved to: ${outputFile}`);

  // Clean up progress file
  try {
    if (existsSync(PROGRESS_FILE)) {
      writeFileSync(PROGRESS_FILE, JSON.stringify({ completed: true }));
    }
  } catch {}

  await context.close();
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
  log("👋 Done!");
}

// ── Browser detection (same as fetch script) ──

function getBrowserInfo() {
  const username = process.env.USERNAME || "Default";
  const home = `C:\\Users\\${username}`;

  // Try Brave first
  const braveDataDir = `${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data`;
  const braveProfile = join(braveDataDir, "Default");
  if (existsSync(braveProfile)) {
    return {
      name: "Brave",
      executablePath: `C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      altExecutablePath: `${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    };
  }

  // Fall back to Chrome
  return null;
}

function getAvailableBravePath(info) {
  if (existsSync(info.executablePath)) return info.executablePath;
  if (info.altExecutablePath && existsSync(info.altExecutablePath)) return info.altExecutablePath;
  return info.executablePath; // Let it fail naturally
}

// ── Look up profile ID by username ──

async function lookupProfileId(page, username) {
  // Method 1: Username info API (most reliable)
  try {
    const result = await page.evaluate(async (user) => {
      const getCsrf = () => {
        const m = document.cookie.match(/csrftoken=([^;]+)/);
        return m ? m[1] : "";
      };
      const r = await fetch(`https://i.instagram.com/api/v1/users/${user}/usernameinfo/`, {
        headers: { "x-ig-app-id": "936619743392459", "x-csrftoken": getCsrf() },
      });
      const d = await r.json();
      return d.user?.pk || d.user?.id || null;
    }, username);

    if (result) return String(result);
  } catch {}

  // Method 2: Web profile info API
  try {
    const result = await page.evaluate(async (user) => {
      const getCsrf = () => {
        const m = document.cookie.match(/csrftoken=([^;]+)/);
        return m ? m[1] : "";
      };
      const r = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${user}`, {
        headers: { "x-ig-app-id": "936619743392459", "x-csrftoken": getCsrf() },
      });
      const d = await r.json();
      return d.data?.user?.id || null;
    }, username);

    if (result) return String(result);
  } catch {}

  // Method 3: Navigate to profile and extract from HTML
  try {
    await page.goto(`https://www.instagram.com/${username}/`, {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    const result = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;
      const patterns = [/"user_id":"(\d+)"/, /"pk":(\d+)/];
      for (const p of patterns) {
        const m = html.match(p);
        if (m) return m[1];
      }
      return null;
    });
    if (result) return result;
  } catch {}

  return null;
}

// ── Unfollow a single account ──

async function unfollowAccount(page, profileId, username) {
  try {
    const result = await page.evaluate(async (id) => {
      const getCsrf = () => {
        const m = document.cookie.match(/csrftoken=([^;]+)/);
        return m ? m[1] : "";
      };
      const res = await fetch(`https://i.instagram.com/api/v1/friendships/destroy/${id}/`, {
        method: "POST",
        headers: {
          "x-ig-app-id": "936619743392459",
          "x-csrftoken": getCsrf(),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "",
      });
      const data = await res.json();
      return { ok: res.ok && data.status === "ok", data, status: res.status };
    }, profileId);

    if (result.ok) {
      return { profileId, username, success: true };
    }

    const errMsg = result.data?.message || result.data?.error_type || `HTTP ${result.status}`;

    // If rate limited, wait and retry once
    if (result.status === 429 || result.status === 400 || errMsg.toLowerCase().includes("rate") || errMsg.toLowerCase().includes("spam")) {
      log(`   ⏸ Rate limited — pausing 2 minutes...`);
      await new Promise((r) => setTimeout(r, 120000 + Math.random() * 60000));

      // Retry
      const retryResult = await page.evaluate(async (id) => {
        const getCsrf = () => {
          const m = document.cookie.match(/csrftoken=([^;]+)/);
          return m ? m[1] : "";
        };
        const res = await fetch(`https://i.instagram.com/api/v1/friendships/destroy/${id}/`, {
          method: "POST",
          headers: {
            "x-ig-app-id": "936619743392459",
            "x-csrftoken": getCsrf(),
            "content-type": "application/x-www-form-urlencoded",
          },
          body: "",
        });
        const data = await res.json();
        return { ok: res.ok && data.status === "ok", data, status: res.status };
      }, profileId);

      if (retryResult.ok) {
        return { profileId, username, success: true };
      }
      return { profileId, username, success: false, error: retryResult.data?.message || errMsg };
    }

    return { profileId, username, success: false, error: errMsg };
  } catch (err) {
    return { profileId, username, success: false, error: err.message };
  }
}

// ── Run ──

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
