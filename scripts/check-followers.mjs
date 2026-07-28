#!/usr/bin/env node

/**
 * Instagram Follower Health Check
 * ================================
 *
 * Goes through your entire imported followers list and checks each one LIVE
 * on Instagram to see if they're still following you. No removal — just checking.
 *
 * USAGE:
 *   node scripts/check-followers.mjs <followers-file.json>
 *   node scripts/check-followers.mjs <followers-file.json> --resume
 *   node scripts/check-followers.mjs <followers-file.json> -u <username>
 *   node scripts/check-followers.mjs <followers-file.json> -n 100
 *
 * INPUT FORMAT (exported from the app's Import or Review page — any JSON with usernames):
 *   [ { "username": "someone", ... }, { "username": "another", ... } ]
 *
 * OUTPUT (stdout):
 *   EVENT: check  data: {"username":"someone","status":"verified"}
 *   EVENT: check  data: {"username":"another","status":"unfollowed"}
 *   EVENT: done   data: {"verified":150,"unfollowed":8,"errors":2}
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = join(__dirname, ".check-followers-progress.json");

// ── Helpers ──

function log(msg) {
  const time = new Date().toLocaleTimeString("en-IN");
  console.error(`[${time}] ${msg}`); // stderr for internal logs
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function withTimeout(promise, ms, label = "operation") {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`⏰ ${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    ),
  ]);
}

function ask(query) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (a) => { rl.close(); resolve(a); }));
}

// ── Browser detection (same as unfollow-brave) ──

function findBrowser() {
  const username = process.env.USERNAME || "Default";
  const home = `C:\\Users\\${username}`;

  const braveDataDir = `${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data`;
  if (existsSync(braveDataDir)) {
    const exe = "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe";
    const altExe = `${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`;
    return {
      name: "Brave",
      userDataDir: braveDataDir,
      executablePath: existsSync(exe) ? exe : (existsSync(altExe) ? altExe : exe),
    };
  }

  const chromeDataDir = `${home}\\AppData\\Local\\Google\\Chrome\\User Data`;
  if (existsSync(chromeDataDir)) {
    return { name: "Chrome", userDataDir: chromeDataDir, channel: "chrome" };
  }

  return null;
}

// ── Instagram UI actions ──

async function getOwnUsername(page) {
  try {
    const username = await page.evaluate(() => {
      try {
        const data = window.__INITIAL_STATE__ || window.__NEXT_DATA__;
        if (data?.viewportData?.username) return data.viewportData.username;
      } catch {}
      const html = document.documentElement.innerHTML;
      const m = html.match(/"username":"([^"]+)"/);
      return m ? m[1] : null;
    });
    if (username) return username;
  } catch {}

  const answer = await ask("Enter your Instagram username (without @): ");
  return answer.replace(/^@/, "").trim();
}

async function openFollowersDialog(page, myUsername) {
  log(`🌐 Going to your profile...`);
  await withTimeout(
    page.goto(`https://www.instagram.com/${myUsername}/`, {
      waitUntil: "networkidle",
      timeout: 30000,
    }),
    35000,
    "navigation to profile"
  );
  await sleep(4000);

  log("🔍 Finding Followers button...");
  const result = await page.evaluate(() => {
    const link = document.querySelector(`a[href*="/followers/"]`);
    if (link) { link.click(); return { method: 'href-link' }; }

    const interactive = document.querySelectorAll('a, button, [role="link"], [role="button"]');
    for (const el of interactive) {
      const txt = (el.textContent || '').trim();
      if (/^[\d,]+\s*followers?$/i.test(txt)) { el.click(); return { method: 'interactive-num', found: txt.slice(0, 30) }; }
    }
    for (const el of interactive) {
      const txt = (el.textContent || '').toLowerCase().trim();
      if (txt.includes('followers') && !txt.includes('following')) { el.click(); return { method: 'interactive-text', found: txt.slice(0, 30) }; }
    }

    const spans = document.querySelectorAll('span');
    for (const el of spans) {
      const txt = (el.textContent || '').trim();
      if (/^[\d,]+\s*followers?$/i.test(txt)) { el.click(); return { method: 'span-num', found: txt.slice(0, 30) }; }
    }

    const all = document.querySelectorAll('div, li, p, section, ul');
    for (const el of all) {
      const txt = (el.textContent || '').trim();
      if (/^[\d,]+\s*followers?$/i.test(txt)) { el.click(); return { method: 'container-num', found: txt.slice(0, 30) }; }
    }

    for (const el of document.querySelectorAll('[aria-label], [title]')) {
      const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
      if (aria.includes('follower') && !aria.includes('following')) { el.click(); return { method: 'aria', found: aria.slice(0, 30) }; }
    }
    return null;
  });

  if (result) {
    log(`   ✓ Clicked via: ${result.method} (${result.found})`);
  } else {
    throw new Error("Could not find the Followers button. Instagram layout may have changed.");
  }

  const dialog = await page.waitForSelector('div[role="dialog"]', { timeout: 10000 }).catch(() => null);
  if (dialog) log("✅ Followers dialog opened!");
  else {
    await sleep(3000);
    const d2 = await page.waitForSelector('div[role="dialog"]', { timeout: 5000 }).catch(() => null);
    if (!d2) log("⚠️ Dialog not detected but continuing...");
  }
  await sleep(1500);
}

// ── Check a single follower (pure check, NO remove) ──

async function checkFollower(page, myUsername, username) {
  const dialog = page.locator('div[role="dialog"]');

  // Ensure dialog is open
  try {
    const visible = await dialog.isVisible();
    if (!visible) await openFollowersDialog(page, myUsername);
  } catch {
    await openFollowersDialog(page, myUsername);
  }

  // Type username in search
  try {
    const searchInput = dialog.locator("input").first();
    await withTimeout(searchInput.waitFor({ state: "visible", timeout: 5000 }), 7000, "finding search input");
    await searchInput.click();
    await searchInput.fill("");
    await sleep(300);
    await searchInput.fill(username);
    await sleep(3000); // Wait for results to filter
  } catch (err) {
    throw new Error(`Could not search for @${username}: ${err.message}`);
  }

  // Check if username appears in filtered results
  const found = await dialog.evaluate((dialogEl, user) => {
    const candidates = dialogEl.querySelectorAll('span, a, div, li');
    for (const el of candidates) {
      const text = el.textContent?.toLowerCase().trim() || '';
      if (text === user.toLowerCase()) return true;
    }
    return false;
  }, username);

  return found;
}

// ── Progress ──

function loadProgress() {
  try { return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8")); } catch { return null; }
}

function saveProgress(data) {
  try { writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2)); } catch {} 
}

function emitEvent(type, data) {
  // stdout goes to the parent process for SSE
  process.stdout.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => !a.startsWith("--"));
  const resumeMode = args.includes("--resume") || args.includes("-r");

  // Parse --from-username / -u
  let fromUsername = null;
  const fromIdx = args.indexOf("--from-username");
  if (fromIdx !== -1 && fromIdx + 1 < args.length) fromUsername = args[fromIdx + 1].toLowerCase();
  const shortFromIdx = args.indexOf("-u");
  if (shortFromIdx !== -1 && shortFromIdx + 1 < args.length && !fromUsername) fromUsername = args[shortFromIdx + 1].toLowerCase();

  // Parse --from <number> / -n
  let fromNumber = null;
  const fromNumIdx = args.indexOf("--from");
  if (fromNumIdx !== -1 && fromNumIdx + 1 < args.length) {
    const val = parseInt(args[fromNumIdx + 1], 10);
    if (!isNaN(val) && val > 0) fromNumber = val;
  }
  const shortFromNumIdx = args.indexOf("-n");
  if (shortFromNumIdx !== -1 && shortFromNumIdx + 1 < args.length && !fromNumber) {
    const val = parseInt(args[shortFromNumIdx + 1], 10);
    if (!isNaN(val) && val > 0) fromNumber = val;
  }

  if (!fileArg || args.includes("--help") || args.includes("-h")) {
    console.error(`
Instagram Follower Health Check

Goes through ALL followers and checks if they're still following you.
No removal — just verification.

USAGE:
  node scripts/check-followers.mjs <followers-file.json>
  node scripts/check-followers.mjs <followers-file.json> --resume
  node scripts/check-followers.mjs <followers-file.json> -u <username>
  node scripts/check-followers.mjs <followers-file.json> -n <number>

FLAGS:
  --resume, -r    Resume from saved progress
  -u <username>   Start from a specific username
  -n <number>     Start from account number (1-based)

OUTPUT: SSE events on stdout for real-time progress
`);
    process.exit(0);
  }

  // ── Parse input file ──
  let raw;
  try { raw = readFileSync(fileArg, "utf-8"); }
  catch { console.error(`❌ Could not read file: ${fileArg}`); process.exit(1); }

  let parsed;
  try { parsed = JSON.parse(raw); } catch { console.error(`❌ Invalid JSON in ${fileArg}`); process.exit(1); }

  let profiles = Array.isArray(parsed)
    ? parsed.map((p) => (typeof p === "string" ? { username: p } : p))
    : [];

  profiles = profiles.filter((p) => p.username && p.username.trim());
  if (profiles.length === 0) { console.error("❌ No valid usernames found."); process.exit(1); }

  console.error("");
  console.error("╔══════════════════════════════════════════════╗");
  console.error("║       Instagram Follower Health Check       ║");
  console.error("╚══════════════════════════════════════════════╝");
  console.error("");
  console.error(`   🔍 ${profiles.length} followers to check`);
  console.error(`   💾 Progress saved — resume with --resume`);
  console.error("");

  // ── Resume handling ──
  let startIndex = 0;
  let results = { verified: 0, unfollowed: 0, errors: 0 };

  if (fromNumber !== null) {
    startIndex = fromNumber - 1;
    if (startIndex >= profiles.length) { console.error(`❌ Starting index #${fromNumber} is beyond list.`); process.exit(1); }
    log(`📋 Starting from account #${fromNumber}/${profiles.length}: @${profiles[startIndex].username}`);
  } else if (fromUsername) {
    const foundIdx = profiles.findIndex((p) => p.username.toLowerCase() === fromUsername);
    if (foundIdx === -1) {
      const similar = profiles.filter(p => p.username.toLowerCase().includes(fromUsername));
      console.error(`   Did you mean? ${similar.slice(0, 5).map(p => '@' + p.username).join(', ')}`);
      process.exit(1);
    }
    startIndex = foundIdx;
    log(`📋 Starting from @${profiles[foundIdx].username} (#${foundIdx + 1}/${profiles.length})`);
  } else if (resumeMode) {
    const prog = loadProgress();
    if (prog && prog.completedIndex > 0) {
      startIndex = prog.completedIndex;
      results = prog.results || { verified: 0, unfollowed: 0, errors: 0 };
      log(`📋 Resuming from account ${startIndex + 1}/${profiles.length}`);
      console.error(`   Progress: ✓${results.verified} verified · ↪️${results.unfollowed} unfollowed · ✗${results.errors} errors`);
    } else {
      log("📋 No saved progress. Starting fresh.");
      const answer = await ask("   Start fresh? (Y/n): ");
      if (answer.toLowerCase() === "n") { console.error("   ❌ Cancelled."); process.exit(0); }
    }
  } else if (existsSync(PROGRESS_FILE)) {
    const prog = loadProgress();
    if (prog && prog.completedIndex > 0 && prog.completedIndex < profiles.length) {
      console.error("   📋 Previous session detected. Resume with --resume");
      const answer = await ask("   Start fresh? (Y/n): ");
      if (answer.toLowerCase() === "n") { console.error("   ❌ Cancelled. Use --resume"); process.exit(0); }
    }
  }

  // ── Find & launch browser ──
  const browserInfo = findBrowser();
  if (!browserInfo) { console.error("❌ Could not find Brave or Chrome."); process.exit(1); }
  log(`🚀 Launching ${browserInfo.name} with your profile...`);
  console.error("   ⚠️  Existing browser windows may close. Save your work first!");
  console.error("");

  const context = await chromium.launchPersistentContext(browserInfo.userDataDir, {
    headless: false,
    channel: browserInfo.channel || undefined,
    executablePath: browserInfo.executablePath || undefined,
    args: ["--no-sandbox", "--disable-blink-features=AutomationControlled", "--disable-features=ChromeWhatsNewUI"],
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  await page.addInitScript(() => { Object.defineProperty(navigator, "webdriver", { get: () => undefined }); });

  // ── Open Instagram & login ──
  log("🌐 Opening Instagram...");
  await page.goto("https://www.instagram.com/", { waitUntil: "networkidle", timeout: 60000 });

  if (page.url().includes("login") || page.url().includes("accounts/login")) {
    log("🔑 Not logged in! Please log in.");
    await ask("   Press Enter after logging in... ");
    await page.goto("https://www.instagram.com/", { waitUntil: "networkidle", timeout: 60000 });
  }
  log("✅ Logged in!");

  const myUsername = await getOwnUsername(page);
  if (!myUsername) { console.error("❌ Could not determine username."); await context.close(); process.exit(1); }
  log(`👤 Logged in as @${myUsername}`);

  await openFollowersDialog(page, myUsername);

  // ── Check loop ──
  const BATCH_SIZE = 50; // Emit batch events for efficient UI updates
  let batch = [];
  let batchCount = 0;

  for (let i = startIndex; i < profiles.length; i++) {
    const p = profiles[i];
    const username = p.username.trim();
    const label = `[${i + 1}/${profiles.length}]`;

    try {
      // Update page title
      try { await page.evaluate((n, t) => { document.title = `Checking ${n}/${t} — Instagram Health Check`; }, i + 1, profiles.length); } catch {}

      log(`${label} 🔍 @${username}...`);
      const stillFollowing = await checkFollower(page, myUsername, username);

      if (stillFollowing) {
        log(`${label} ✅ @${username} — still following!`);
        results.verified++;
        batch.push({ username, status: "verified" });
      } else {
        log(`${label} ↪️ @${username} — already unfollowed you!`);
        results.unfollowed++;
        batch.push({ username, status: "unfollowed" });
      }
    } catch (err) {
      log(`${label} ❌ @${username} — ${err.message}`);
      results.errors++;
      batch.push({ username, status: "error" });
    }

    // Save + emit progress
    saveProgress({ completedIndex: i + 1, total: profiles.length, results });

    // Emit batch events every few accounts
    batchCount++;
    if (batchCount >= BATCH_SIZE || i === profiles.length - 1) {
      emitEvent("checks", batch);
      emitEvent("progress", { current: i + 1, total: profiles.length, ...results });
      batch = [];
      batchCount = 0;
    }

    // No delay needed between checks — faster since no removal
    const delay = 2000 + Math.floor(Math.random() * 1500); // 2-3.5s (faster than unfollow!)
    await sleep(delay);
  }

  // ── Done ──
  console.error("");
  console.error("╔══════════════════════════════════════════════╗");
  console.error("║           HEALTH CHECK COMPLETE              ║");
  console.error("╚══════════════════════════════════════════════╝");
  console.error("");
  console.error(`   ✅ ${results.verified} still following`);
  console.error(`   ↪️ ${results.unfollowed} already unfollowed`);
  console.error(`   ❌ ${results.errors} errors`);
  console.error("");

  emitEvent("done", results);
  saveProgress({ completed: true, results });

  await context.close();
  log("👋 Done! You can close the browser.");
}

main().catch((err) => {
  console.error("❌ Fatal:", err.message);
  process.exit(1);
});
