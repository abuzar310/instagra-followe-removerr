#!/usr/bin/env node

/**
 * Instagram Brave Remover
 * ========================
 *
 * Removes followers from YOUR Instagram account through the browser UI.
 *
 * HOW IT WORKS:
 *   1. Opens Brave browser with your existing profile (you're already logged in!)
 *   2. Goes to your profile → clicks "Followers"
 *   3. For each account: types the username in the search box, clicks "Remove",
 *      then clicks "Remove" again in the confirmation popup
 *   4. Paced at ~70-80 removals per hour to avoid suspicion
 *   5. Runs in 1-hour sessions (~70-75 removals), then saves progress and exits
 *   6. Resume later with --resume
 *
 * USAGE:
 *   node scripts/unfollow-brave.mjs <approved-accounts.json>
 *   node scripts/unfollow-brave.mjs <approved-accounts.json> --resume
 *   node scripts/unfollow-brave.mjs <approved-accounts.json> --from-username <username>
 *
 * INPUT FORMAT (exported from the app's Review page → Export → JSON — Approved only):
 *   [
 *     { "username": "botaccount1", "full_name": "...", ... },
 *     { "username": "botaccount2", ... }
 *   ]
 *
 * The script only needs the "username" field. All other fields are ignored.
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = join(__dirname, ".brave-unfollow-progress.json");

// ── Helpers ──

function log(msg) {
  const time = new Date().toLocaleTimeString("en-IN");
  console.log(`[${time}] ${msg}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Run an async operation with a timeout. If the operation doesn't complete
 * within the given time, it throws a TimeoutError.
 */
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

// ── Configuration ──

const TARGET_PER_HOUR = 75;         // ~75 removals per hour
const SESSION_MINUTES = 55;          // Run for ~55 min, then rest
const BETWEEN_ACCOUNT_MS = Math.floor(3600000 / TARGET_PER_HOUR);  // ~48 sec base
const JITTER_MS = 15000;             // ±15 sec random jitter
const SESSION_ACCOUNTS = Math.floor(TARGET_PER_HOUR * (SESSION_MINUTES / 60)); // ~69 per session

// ── Browser detection ──

function findBrowser() {
  const username = process.env.USERNAME || "Default";
  const home = `C:\\Users\\${username}`;

  // Try Brave first
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

  // Fallback to Chrome
  const chromeDataDir = `${home}\\AppData\\Local\\Google\\Chrome\\User Data`;
  if (existsSync(chromeDataDir)) {
    return { name: "Chrome", userDataDir: chromeDataDir, channel: "chrome" };
  }

  return null;
}

// ── Instagram UI actions ──

async function getOwnUsername(page) {
  // Try extracting from the page first
  try {
    const username = await page.evaluate(() => {
      // Look in shared data
      try {
        const data = window.__INITIAL_STATE__ || window.__NEXT_DATA__;
        if (data?.viewportData?.username) return data.viewportData.username;
      } catch {}

      // Look in page source
      const html = document.documentElement.innerHTML;
      const m = html.match(/"username":"([^"]+)"/);
      return m ? m[1] : null;
    });
    if (username) return username;
  } catch {}

  // Ask user
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
  // Wait for React to fully render the stats section
  await sleep(4000);

  log("🔍 Finding Followers button...");

  // ── Click the followers element via DOM evaluation ──
  // Priority order: interactive elements first (<a>, buttons, roles),
  // then specific text matches, then generic containers.
  // This avoids clicking a parent container that does nothing.
  const result = await page.evaluate((username) => {
    // ── Priority 1: Direct clickable link with href ──
    const link = document.querySelector(`a[href*="/followers/"]`);
    if (link) { link.click(); return { method: 'href-link' }; }

    // ── Priority 2: Interactive elements (a, button, role=link/button) with text "NUMBER followers" ──
    const interactive = document.querySelectorAll('a, button, [role="link"], [role="button"]');
    for (const el of interactive) {
      const txt = (el.textContent || '').trim();
      if (/^[\d,]+\s*followers?$/i.test(txt)) {
        el.click();
        return { method: 'interactive-num', found: txt.slice(0, 30) };
      }
    }

    // ── Priority 3: Interactive elements with just "followers" or partial match ──
    for (const el of interactive) {
      const txt = (el.textContent || '').toLowerCase().trim();
      if (txt.includes('followers') && !txt.includes('following')) {
        el.click();
        return { method: 'interactive-text', found: txt.slice(0, 30) };
      }
    }

    // ── Priority 4: span elements with "NUMBER followers" text ──
    const spans = document.querySelectorAll('span');
    for (const el of spans) {
      const txt = (el.textContent || '').trim();
      if (/^[\d,]+\s*followers?$/i.test(txt)) {
        el.click();
        return { method: 'span-num', found: txt.slice(0, 30) };
      }
    }

    // ── Priority 5: Any element with "NUMBER followers" text ──
    const all = document.querySelectorAll('div, li, p, section, ul');
    for (const el of all) {
      const txt = (el.textContent || '').trim();
      if (/^[\d,]+\s*followers?$/i.test(txt)) {
        el.click();
        return { method: 'container-num', found: txt.slice(0, 30) };
      }
    }

    // ── Priority 6: ARIA labels ──
    for (const el of document.querySelectorAll('[aria-label], [title]')) {
      const aria = (el.getAttribute('aria-label') || el.getAttribute('title') || '').toLowerCase();
      if (aria.includes('follower') && !aria.includes('following')) {
        el.click();
        return { method: 'aria', found: aria.slice(0, 30) };
      }
    }

    return null;
  }, myUsername);

  if (result) {
    log(`   ✓ Clicked via: ${result.method} (${result.found})`);
  } else {
    // ── Debug: collect ALL text from the page top section ──
    console.log("   ❌ Could not find Followers button. Collecting page data...");
    const pageData = await page.evaluate(() => {
      const info = { title: document.title, url: window.location.href };
      // Collect ALL visible text nodes in the upper half
      const texts = [];
      const all = document.querySelectorAll('a, span, div, button, li, p, h1, h2, h3, h4, section, ul, svg');
      for (const el of all) {
        const txt = el.textContent || '';
        const trimmed = txt.trim();
        if (trimmed.length > 0 && trimmed.length < 150) {
          const rect = el.getBoundingClientRect();
          texts.push({
            tag: el.tagName,
            text: trimmed.slice(0, 60),
            href: el.getAttribute('href') || '',
            role: el.getAttribute('role') || '',
            aria: (el.getAttribute('aria-label') || '').slice(0, 40),
            top: Math.round(rect.top),
            visible: rect.top >= 0 && rect.top < window.innerHeight,
          });
        }
      }
      // Sort by position on page and take top elements
      texts.sort((a, b) => a.top - b.top);
      info.elements = texts.slice(0, 60);
      return info;
    });

    console.log("   📄 Page data (top elements first):");
    console.log(JSON.stringify(pageData, null, 2));
    throw new Error(
      "Could not find the Followers button. " +
      "The page data above shows what Instagram rendered. " +
      "Please share this output so I can fix the selector."
    );
  }

  // Wait for dialog to appear
  const dialog = await page.waitForSelector('div[role="dialog"]', { timeout: 10000 }).catch(() => null);
  if (!dialog) {
    await sleep(3000);
    const dialog2 = await page.waitForSelector('div[role="dialog"]', { timeout: 5000 }).catch(() => null);
    if (!dialog2) {
      console.log("   ⚠️ Dialog not detected, but the click might have worked. Continuing...");
    }
  } else {
    log("✅ Followers dialog opened!");
  }

  await sleep(1500);
}

async function removeFollower(page, myUsername, username) {
  // Find the search input inside the dialog and type the username
  const dialog = page.locator('div[role="dialog"]');

  // If the dialog is closed, re-open it
  try {
    const visible = await dialog.isVisible();
    if (!visible) {
      await openFollowersDialog(page, myUsername);
    }
  } catch {
    await openFollowersDialog(page, myUsername);
  }

  try {
    const searchInput = dialog.locator("input").first();
    await withTimeout(
      searchInput.waitFor({ state: "visible", timeout: 5000 }),
      7000,
      "finding search input"
    );
    await searchInput.click();

    // Clear and type the username
    await searchInput.fill("");
    await sleep(300);
    await searchInput.fill(username);
    await sleep(3000); // Wait for search results to filter
  } catch (err) {
    throw new Error(`Could not search for @${username}: ${err.message}`);
  }

  // ⚠️ SAFETY: NEVER use a blind "first Remove button on the page" approach!
  // That would click a different user's Remove button if the searched user isn't found.
  // Always verify the username is showing in the dialog before clicking Remove.

  // First, check if the username actually appears in the filtered results
  const usernameVisible = await dialog.evaluate((user) => {
    const candidates = document.querySelectorAll(
      'div[role="dialog"] span, div[role="dialog"] a, div[role="dialog"] div, div[role="dialog"] li'
    );
    for (const el of candidates) {
      const text = el.textContent?.toLowerCase().trim() || '';
      if (text === user.toLowerCase()) {
        return true;
      }
    }
    return false;
  }, username);

  if (!usernameVisible) {
    throw new Error(
      `@${username} not found in Followers list. They may already be removed or not following you.`
    );
  }

  // Now safely find the Remove button associated with THIS username
  const clicked = await dialog.evaluate((user) => {
    const candidates = document.querySelectorAll(
      'div[role="dialog"] span, div[role="dialog"] a, div[role="dialog"] div, div[role="dialog"] li'
    );
    for (const el of candidates) {
      const elText = el.textContent?.toLowerCase().trim() || '';
      if (elText === user.toLowerCase()) {
        let parent = el.parentElement;
        for (let i = 0; i < 8 && parent; i++) {
          const btns = parent.querySelectorAll("button, div[role='button']");
          for (const btn of btns) {
            if (btn.textContent?.toLowerCase().trim() === "remove") {
              btn.click();
              return true;
            }
          }
          parent = parent.parentElement;
        }
      }
    }
    return false;
  }, username);

  if (!clicked) {
    throw new Error(
      `@${username} found in search results but could not find the Remove button. Skipping.`
    );
  }

  // Wait for confirmation popup to appear
  await sleep(1500);

  // Click "Remove" in the confirmation popup
  try {
    const confirmBtn = page
      .locator(
        'div[role="dialog"]:has(:text-is("Cancel")) button:has-text("Remove"), ' +
          'div[role="dialog"]:has(:text-is("Cancel")) div[role="button"]:has-text("Remove")'
      )
      .first();
    await withTimeout(confirmBtn.click({ timeout: 5000 }), 7000, "clicking confirm remove");
  } catch {
    // Fallback: find any visible "Remove" button on the page
    const clicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll("button, div[role='button']");
      for (const btn of buttons) {
        const text = btn.textContent?.toLowerCase().trim();
        if (text === "remove" && btn.offsetParent !== null) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    if (!clicked) {
      throw new Error("Could not find the Remove confirmation button.");
    }
  }

  // Wait for Instagram to process the removal
  await sleep(2000);
}

// ── Progress helpers ──

function loadProgress() {
  try {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  } catch {
    return null;
  }
}

function saveProgress(data) {
  try {
    writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
  } catch {}
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const fileArg = args.find((a) => !a.startsWith("--"));
  const resumeMode = args.includes("--resume") || args.includes("-r");

  // Parse --from-username <username>
  let fromUsername = null;
  const fromIdx = args.indexOf("--from-username");
  if (fromIdx !== -1 && fromIdx + 1 < args.length) {
    fromUsername = args[fromIdx + 1].toLowerCase();
  }
  const shortFromIdx = args.indexOf("-u");
  if (shortFromIdx !== -1 && shortFromIdx + 1 < args.length && !fromUsername) {
    fromUsername = args[shortFromIdx + 1].toLowerCase();
  }

  if (!fileArg || args.includes("--help") || args.includes("-h")) {
    console.log(`
Instagram Brave Remover

Removes followers from YOUR Instagram through the browser UI.
Safe, human-paced, and saves progress so you can resume anytime.

USAGE:
  node scripts/unfollow-brave.mjs <approved-accounts.json>
  node scripts/unfollow-brave.mjs <approved-accounts.json> --resume
  node scripts/unfollow-brave.mjs <approved-accounts.json> --from-username <username>
  node scripts/unfollow-brave.mjs <approved-accounts.json> -u <username>

  The input JSON file is what you export from the app's Review page.
  Use: Export → JSON — Approved only

HOW IT WORKS:
  • Opens Brave browser with YOUR profile (you're already logged in)
  • Goes to your Instagram profile
  • Opens the Followers dialog
  • Searches for each approved account
  • Clicks Remove → confirms Remove
  • Pace: ~${TARGET_PER_HOUR} removals per hour (~${Math.round(BETWEEN_ACCOUNT_MS / 1000)} sec each)
  • Sessions: ~${SESSION_ACCOUNTS} removals (~${SESSION_MINUTES} min), then saves & exits
  • Resume later with --resume or resume from any username with --from-username

Pacing:
  Between each removal: ${Math.round((BETWEEN_ACCOUNT_MS - JITTER_MS) / 1000)}–${Math.round((BETWEEN_ACCOUNT_MS + JITTER_MS) / 1000)} seconds
  Per session: ~${SESSION_ACCOUNTS} accounts (~${SESSION_MINUTES} minutes)
  You can run multiple sessions with breaks in between
`);
    process.exit(0);
  }

  // ── Parse input file ──
  let raw;
  try {
    raw = readFileSync(fileArg, "utf-8");
  } catch {
    console.log(`❌ Could not read file: ${fileArg}`);
    console.log("   Make sure the path is correct.");
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.log(`❌ Invalid JSON in ${fileArg}`);
    process.exit(1);
  }

  let profiles = Array.isArray(parsed)
    ? parsed.map((p) => (typeof p === "string" ? { username: p } : p))
    : [];

  if (profiles.length === 0) {
    console.log("❌ No profiles found in the file.");
    process.exit(1);
  }

  profiles = profiles.filter((p) => p.username && p.username.trim());
  if (profiles.length === 0) {
    console.log("❌ No valid usernames found in the file.");
    process.exit(1);
  }

  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║        Instagram Follower Remover            ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
  console.log(`   🎯 ${profiles.length} accounts to remove`);
  console.log(`   ⏱ Pace: ~${TARGET_PER_HOUR}/hour (${Math.round((BETWEEN_ACCOUNT_MS - JITTER_MS) / 1000)}–${Math.round((BETWEEN_ACCOUNT_MS + JITTER_MS) / 1000)}s each)`);
  console.log(`   📦 Sessions: ~${SESSION_ACCOUNTS} accounts per session`);
  console.log(`   💾 Progress saved — resume anytime with --resume`);
  console.log("");

  // ── Resume from progress or specific username ──
  let startIndex = 0;
  let session = 1;
  let results = { removed: 0, skipped: 0, errors: 0 };

  // If --from-username is given, find that username in the list
  if (fromUsername) {
    const foundIdx = profiles.findIndex((p) => p.username.toLowerCase() === fromUsername);
    if (foundIdx === -1) {
      console.log(`   ❌ Username "@${fromUsername}" not found in the list.`);
      // Show nearby matches
      const similar = profiles.filter(p => p.username.toLowerCase().includes(fromUsername));
      if (similar.length > 0) {
        console.log(`   Did you mean one of these? ${similar.slice(0, 5).map(p => '@' + p.username).join(', ')}`);
      }
      process.exit(1);
    }
    startIndex = foundIdx;
    log(`📋 Starting from @${profiles[foundIdx].username} (#${foundIdx + 1}/${profiles.length})`);
    console.log("");
  } else if (resumeMode) {
    const prog = loadProgress();
    if (prog && prog.completedIndex > 0) {
      startIndex = prog.completedIndex;
      session = prog.session || 1;
      results = prog.results || { removed: 0, skipped: 0, errors: 0 };
      log(`📋 Resuming from session #${session}, account ${startIndex + 1}/${profiles.length}`);
      console.log(`   Progress so far: ✓${results.removed} removed · ⏭${results.skipped} skipped · ✗${results.errors} errors`);
      console.log("");
    } else {
      log("📋 No saved progress found. Starting from the beginning.");
      const answer = await ask("   Start fresh? (Y/n): ");
      if (answer.toLowerCase() === "n") {
        console.log("   ❌ Cancelled.");
        process.exit(0);
      }
    }
  } else if (existsSync(PROGRESS_FILE)) {
    const prog = loadProgress();
    if (prog && prog.completedIndex > 0 && prog.completedIndex < profiles.length) {
      console.log("   📋 Previous session detected. You can resume with:");
      console.log(`   node scripts/unfollow-brave.mjs ${fileArg} --resume`);
      console.log(`   node scripts/unfollow-brave.mjs ${fileArg} -u <last-username>`);
      console.log("");
      const answer = await ask("   Start a fresh session instead? (Y/n): ");
      if (answer.toLowerCase() === "n") {
        console.log("   ❌ Cancelled. Use --resume to pick up where you left off.");
        process.exit(0);
      }
    }
  }

  // ── Find browser ──
  const browserInfo = findBrowser();
  if (!browserInfo) {
    console.log("❌ Could not find Brave or Chrome browser installation.");
    console.log("   Make sure Brave or Chrome is installed on your system.");
    process.exit(1);
  }
  log(`🚀 Launching ${browserInfo.name} with your profile...`);
  console.log("   ⚠️  Any existing browser windows may close. Save your work first!");
  console.log("");

  const context = await chromium.launchPersistentContext(browserInfo.userDataDir, {
    headless: false,
    channel: browserInfo.channel || undefined,
    executablePath: browserInfo.executablePath || undefined,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-features=ChromeWhatsNewUI",
    ],
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  // ── Open Instagram ──
  log("🌐 Opening Instagram...");
  await page.goto("https://www.instagram.com/", {
    waitUntil: "networkidle",
    timeout: 60000,
  });

  // Check if logged in
  if (page.url().includes("login") || page.url().includes("accounts/login")) {
    log("🔑 Not logged in! Please log in in the browser window.");
    console.log("   (If the login page is stuck, try refreshing manually)");
    await ask("   Press Enter after logging in... ");
    await page.goto("https://www.instagram.com/", {
      waitUntil: "networkidle",
      timeout: 60000,
    });
  }
  log("✅ Logged in!");

  // ── Get own username ──
  const myUsername = await getOwnUsername(page);
  if (!myUsername) {
    console.log("❌ Could not determine your Instagram username.");
    await context.close();
    process.exit(1);
  }
  log(`👤 Logged in as @${myUsername}`);

  // ── Open Followers dialog ──
  await openFollowersDialog(page, myUsername);

  // ── Removal loop ──
  let i = startIndex;

  while (i < profiles.length) {
    const sessionStartAccount = i;
    const sessionEnd = Math.min(i + SESSION_ACCOUNTS, profiles.length);
    const sessionSize = sessionEnd - sessionStartAccount;

    console.log("");
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`   📦 SESSION #${session} — ${sessionSize} accounts`);
    console.log(`   (${i + 1}–${sessionEnd} of ${profiles.length})`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log("");

    for (; i < sessionEnd; i++) {
      const p = profiles[i];
      const username = p.username.trim();
      const label = `[${i + 1}/${profiles.length}]`;

      // Update tab title for visual feedback
      try {
        await page.evaluate(
          (n, t) => { document.title = `Removing ${n}/${t} — Instagram`; },
          i + 1,
          profiles.length
        );
      } catch {}

      try {
        log(`${label} 🔍 Searching @${username}...`);
        await removeFollower(page, myUsername, username);
        log(`${label} ✅ @${username} — removed!`);
        results.removed++;
      } catch (err) {
        const msg = err.message;
        if (
          msg.includes("not found") ||
          msg.includes("already removed") ||
          msg.includes("not following")
        ) {
          log(`${label} ⏭ @${username} — ${msg}`);
          results.skipped++;
        } else {
          log(`${label} ❌ @${username} — ${msg}`);
          results.errors++;
        }
      }

      // Close any lingering confirmation dialogs
      try {
        const hasDialog = await page
          .locator('div[role="dialog"]')
          .isVisible()
          .catch(() => false);
        if (hasDialog) {
          await page.keyboard.press("Escape");
          await sleep(1000);
          const stillOpen = await page
            .locator('div[role="dialog"]')
            .isVisible()
            .catch(() => false);
          if (stillOpen) {
            await page.keyboard.press("Escape");
            await sleep(500);
          }
        }
      } catch {}

      // Save progress after each removal
      saveProgress({ completedIndex: i + 1, session, total: profiles.length, results });

      // Session progress line
      const doneInSession = i - sessionStartAccount + 1;
      const pct = Math.round((doneInSession / sessionSize) * 100);
      log(`📊 Session #${session}: ${doneInSession}/${sessionSize} (${pct}%)`);

      // Delay before next removal (skip delay for the last one in session)
      if (i < sessionEnd - 1) {
        const delay =
          BETWEEN_ACCOUNT_MS -
          JITTER_MS +
          Math.floor(Math.random() * JITTER_MS * 2);
        const eta = new Date(
          Date.now() + (sessionEnd - i - 1) * BETWEEN_ACCOUNT_MS
        ).toLocaleTimeString("en-IN");
        const secs = Math.round(delay / 1000);
        log(`⏳ Waiting ${secs}s (next at ~${eta})...`);
        await sleep(delay);
      }
    }

    // ── Session complete ──
    console.log("");
    console.log(`✅ Session #${session} complete!`);
    console.log(`   ✓ ${results.removed} removed`);
    console.log(`   ⏭ ${results.skipped} skipped`);
    console.log(`   ✗ ${results.errors} errors`);

    if (i >= profiles.length) {
      console.log("");
      console.log("🎉 ALL DONE! All accounts processed.");
      break;
    }

    console.log("");
    console.log(`⏩ Auto-continuing to Session #${session + 1}...`);
    console.log(`   (${profiles.length - i} accounts remaining)`);
    console.log(`   💡 Press Ctrl+C anytime to stop — progress is saved!`);
    console.log("");

    session++;

    // Refresh before next session
    log("🌐 Refreshing Instagram for next session...");
    try {
      await withTimeout(
        page.goto(`https://www.instagram.com/${myUsername}/`, {
          waitUntil: "networkidle",
          timeout: 30000,
        }),
        35000,
        "navigation between sessions"
      );
      await sleep(2000);
    } catch (err) {
      log(`⚠️  Navigation issue: ${err.message}`);
      log("🔑 If Instagram asks you to log in, do so in the browser.");
      await ask("   Press Enter after the page loads... ");
    }

    // Re-open followers dialog
    await openFollowersDialog(page, myUsername);
  }

  // ── Final summary ──
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║            FINAL SUMMARY                     ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
  console.log(`   ✅ ${results.removed} removed`);
  console.log(`   ⏭ ${results.skipped} skipped (not in your followers)`);
  console.log(`   ❌ ${results.errors} errors`);
  console.log("");

  // Save final results
  const outputFile = join(__dirname, "brave-removal-results.json");
  writeFileSync(
    outputFile,
    JSON.stringify(
      {
        ...results,
        totalProfiles: profiles.length,
        completedAt: new Date().toISOString(),
      },
      null,
      2
    )
  );
  log(`💾 Results saved to: ${outputFile}`);

  // Clean up progress
  saveProgress({ completed: true, results });

  await context.close();
  log("👋 Done! You can close the browser window.");
}

// ── Run ──

main().catch((err) => {
  console.error("❌ Fatal error:", err.message);
  process.exit(1);
});
