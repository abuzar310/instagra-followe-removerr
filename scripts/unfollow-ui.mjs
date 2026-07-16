#!/usr/bin/env node

/**
 * Instagram UI Unfollower v3
 * ==========================
 *
 * Uses YOUR real browser to unfollow via the Instagram UI:
 *   1. Goes to YOUR profile → clicks "Followers"
 *   2. Searches for each username in the dialog search box
 *   3. Clicks "Remove" → "Remove" in the confirmation
 *
 * No API calls — Instagram sees normal human behavior.
 * Uses Playwright locators (not brittle DOM evaluate).
 *
 * Usage:
 *   node scripts/unfollow-ui.mjs <profiles-file.json>
 *   node scripts/unfollow-ui.mjs --test <profiles-file.json>   ← quick test (1 account, no delays)
 *
 * JSON format:
 *   [{ "username": "someuser" }, ...]  or  ["someuser", ...]
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createInterface } from "readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROGRESS_FILE = join(__dirname, ".unfollow-ui-progress.json");

function log(msg) {
  console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
}

function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return null;
  try { return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8")); } catch { return null; }
}

function saveProgress(data) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(data, null, 2));
}

function ask(query) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (a) => { rl.close(); resolve(a); }));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Browser detection ──
function getBrowserInfo() {
  const u = process.env.USERNAME || "Default";
  const home = `C:\\Users\\${u}`;

  if (existsSync(`${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data\\Default`)) {
    const exe = `C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`;
    const alt = `${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`;
    return {
      name: "Brave",
      userDataDir: `${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data`,
      executablePath: existsSync(exe) ? exe : alt,
    };
  }
  if (existsSync(`${home}\\AppData\\Local\\Google\\Chrome\\User Data\\Default`)) {
    return {
      name: "Chrome",
      userDataDir: `${home}\\AppData\\Local\\Google\\Chrome\\User Data`,
      channel: "chrome",
    };
  }
  return null;
}

// ── Get own Instagram username from the page ──
async function getOwnUsername(page) {
  try {
    const username = await page.evaluate(() => {
      // Method 1: shared data JSON
      try {
        const data = window.__INITIAL_STATE__ || window.__NEXT_DATA__;
        if (data?.viewportData?.username) return data.viewportData.username;
      } catch {}

      // Method 2: look for the profile avatar link
      const avatar = document.querySelector('a[href^="/"][role="link"] img[alt*="profile"], header img[alt*="profile"]');
      if (avatar) {
        const alt = avatar.getAttribute("alt") || "";
        const m = alt.match(/'s profile/i) || alt.match(/^@?(\w+)/);
        if (m) return m[1].toLowerCase();
      }

      // Method 3: page source regex
      const html = document.documentElement.innerHTML;
      const m = html.match(/"username":"([^"]+)"/);
      return m ? m[1] : "";
    });

    return username || null;
  } catch {
    return null;
  }
}

// ── Navigate to own profile and open Followers dialog ──
async function openFollowersDialog(page, myUsername) {
  // Go to profile
  await page.goto(`https://www.instagram.com/${myUsername}/`, {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await sleep(2000);

  // Click the "followers" link in the profile header
  try {
    await page.locator(`a[href="/${myUsername}/followers/"]`).first().click({ timeout: 5000 });
  } catch {
    // Fallback: try finding it by visible text
    try {
      await page.getByText("followers", { exact: true }).click({ timeout: 3000 });
    } catch {
      // Last resort: try any element with "followers" in top half of page
      const clicked = await page.evaluate(() => {
        const all = document.querySelectorAll('a, button, span, div[role="button"]');
        for (const el of all) {
          const text = (el.textContent || "").toLowerCase().trim();
          if (text === "followers" || text.endsWith(" followers")) {
            const rect = el.getBoundingClientRect();
            if (rect.top < 500) {
              el.click();
              return true;
            }
          }
        }
        return false;
      });
      if (!clicked) throw new Error("Could not find Followers link");
    }
  }

  // Wait for the dialog to appear
  await page.waitForSelector('div[role="dialog"]', { timeout: 8000 }).catch(() => {});
  await sleep(1500);
}

// ── Unfollow a single user via the dialog search ──
async function unfollowViaDialog(page, myUsername, username) {
  // Open the Followers dialog fresh
  await openFollowersDialog(page, myUsername);

  // Type the username in the search box inside the dialog
  const dialog = page.locator('div[role="dialog"]');

  try {
    // Find the search input — Instagram uses a text input with placeholder
    const searchInput = dialog.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])').first();
    const searchByPlaceholder = dialog.locator('input[placeholder*="Search"], input[placeholder*="search"]').first();
    await searchInput.waitFor({ state: "visible", timeout: 5000 });
    await searchInput.click();
    await sleep(500);

    // Use Playwright's fill() which handles React/JSX events correctly
    try {
      await searchInput.fill(username);
    } catch {
      await searchByPlaceholder.fill(username);
    }
    await sleep(3000); // Wait for results to filter
  } catch (err) {
    throw new Error(`Could not search: ${err.message}`);
  }

  // Look for the "Remove" button next to the user row
  let found = false;

  try {
    // Find by exact text match within the dialog
    const removeBtn = dialog.locator(
      'button:text-is("Remove"), div[role="button"]:text-is("Remove")'
    ).first();

    if (await removeBtn.isVisible({ timeout: 3000 })) {
      // With search applied, the first result should be the right user
      await removeBtn.click();
      found = true;
    }
  } catch {
    // Button not visible
  }

  if (!found) {
    // Fallback: search for user element, then find adjacent Remove button
    try {
      const clicked = await dialog.evaluate((user) => {
        const allSpans = document.querySelectorAll('div[role="dialog"] span, div[role="dialog"] a');
        for (const span of allSpans) {
          if (span.textContent?.toLowerCase().trim() === user.toLowerCase()) {
            let parent = span.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              const btn = parent.querySelector('button, div[role="button"]');
              if (btn && btn.textContent?.toLowerCase().trim() === "remove") {
                btn.click();
                return true;
              }
              parent = parent.parentElement;
            }
          }
        }
        return false;
      }, username);
      if (!clicked) throw new Error("Remove button not found in dialog");
    } catch (err) {
      throw new Error(
        `@${username} — not found in Followers list (might already be removed or not following you)`
      );
    }
  }

  // Wait for confirmation popup
  await sleep(1500);

  // Click "Remove" in the confirmation popup
  // The confirmation has both "Remove" and "Cancel" buttons — find the dialog with "Cancel"
  try {
    const confirmDialog = page.locator('div[role="dialog"]:has(:text-is("Cancel"))');
    const confirmBtn = confirmDialog.locator(
      'button:text-is("Remove"), div[role="button"]:text-is("Remove")'
    );
    await confirmBtn.click({ timeout: 5000 });
  } catch {
    // Fallback: find any "Remove" button on the page (might be the only one left)
    const clicked = await page.evaluate(() => {
      const buttons = document.querySelectorAll("button, div[role='button']");
      for (const btn of buttons) {
        if (btn.textContent?.toLowerCase().trim() === "remove") {
          btn.click();
          return true;
        }
      }
      return false;
    });
    if (!clicked) throw new Error("Could not find Remove confirmation button");
  }

  // Wait for unfollow to process
  await sleep(2000);
}

// ── Main ──
async function main() {
  const args = process.argv.slice(2);
  const isTest = args.includes("--test");
  const fileArg = args.find(a => !a.startsWith("--"));

  if (!fileArg) {
    console.log("Usage: node scripts/unfollow-ui.mjs [--test] <profiles.json>");
    process.exit(1);
  }

  // ── Parse input ──
  const raw = readFileSync(fileArg, "utf-8");
  const parsed = JSON.parse(raw);
  let profiles = Array.isArray(parsed)
    ? parsed.map((p) => (typeof p === "string" ? { username: p } : p))
    : parsed.profiles || parsed.results || [];

  // In test mode, only unfollow 1 account
  if (isTest) {
    profiles = [profiles[0]];
    console.log("");
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║       🧪 TEST MODE — 1 quick unfollow       ║");
    console.log("╚══════════════════════════════════════════════╝");
    console.log("");
    console.log(`   🎯 Testing with @${profiles[0]?.username || "unknown"}`);
    console.log(`   ⚡ No delays, no progress save`);
    console.log("");
  } else {
    console.log("");
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║       Instagram UI Unfollower v3            ║");
    console.log("╚══════════════════════════════════════════════╝");
    console.log("");
    console.log(`   🎯 ${profiles.length} accounts to unfollow`);
    console.log(`   🔧 Method: YOUR profile → Followers → Search → Remove`);
    console.log("");
  }

  if (profiles.length === 0) {
    console.log("❌ No profiles to unfollow.");
    process.exit(1);
  }

  // ── Time estimate (not in test mode) ──
  let baseWait = 5000;
  let jitterRange = 3000;

  if (!isTest) {
    const CYCLE_HOURS = 36;
    const CYCLE_MS = CYCLE_HOURS * 60 * 60 * 1000;
    const avgInterval = CYCLE_MS / profiles.length;
    baseWait = Math.max(60000, Math.floor(avgInterval * 0.8));
    jitterRange = Math.max(20000, Math.floor(avgInterval * 0.4));
    const totalHrs = Math.round((profiles.length * (baseWait + jitterRange / 2)) / 3600000 * 10) / 10;
    console.log(`   ⏱ Estimated: ~${totalHrs} hours`);
    console.log(`   ⏸ Delay: ${Math.round(baseWait / 1000)}-${Math.round((baseWait + jitterRange) / 1000)}s`);
    console.log("");
  }

  // ── Launch browser ──
  const browserInfo = getBrowserInfo();
  if (!browserInfo) {
    console.log("❌ Could not find Brave or Chrome profile.");
    process.exit(1);
  }

  log(`🚀 Launching ${browserInfo.name}...`);

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

  // ── Navigate to Instagram ──
  log("🌐 Opening Instagram...");
  await page.goto("https://www.instagram.com/", { waitUntil: "networkidle", timeout: 60000 });

  if (page.url().includes("login")) {
    log("❌ Not logged in. Please log in in the browser window, then press Enter.");
    await ask("   Press Enter when logged in... ");
    await page.goto("https://www.instagram.com/", { waitUntil: "networkidle", timeout: 60000 });
  }
  log("✅ Logged in!");

  // ── Get own username ──
  let myUsername = await getOwnUsername(page);
  if (!myUsername) {
    myUsername = await ask("   Enter your Instagram username (without @): ");
    myUsername = myUsername.replace(/^@/, "").trim();
    if (!myUsername) {
      console.log("❌ Username required.");
      await context.close();
      process.exit(1);
    }
  }
  log(`👤 @${myUsername}`);

  // ── Resume from progress (not in test mode) ──
  let startIndex = 0;
  if (!isTest) {
    const saved = loadProgress();
    if (saved && saved.completed > 0) {
      console.log(`\n📋 Saved progress: ${saved.completed}/${profiles.length} done.`);
      const ans = await ask("   Resume? (Y/n): ");
      if (ans.toLowerCase() !== "n") startIndex = saved.completed;
    }
  }

  // ── Unfollow loop ──
  let errors = 0;
  let skipped = 0;

  for (let i = startIndex; i < profiles.length; i++) {
    const p = profiles[i];
    const username = p.username;
    const label = `[${i + 1}/${profiles.length}]`;

    // Update tab title
    try {
      await page.evaluate(
        (n, t) => { document.title = `Unfollow ${n}/${t}`; },
        i + 1, profiles.length
      );
    } catch {}

    // ── Delay (skip in test mode) ──
    if (i > 0 && !isTest) {
      const delay = baseWait + Math.floor(Math.random() * jitterRange);
      const mins = Math.round(delay / 60000 * 10) / 10;
      const eta = new Date(Date.now() + (profiles.length - i) * (baseWait + jitterRange / 2));
      log(`${label} ⏳ ${mins}min (ETA: ${eta.toLocaleTimeString()})...`);
      const chunk = 10000;
      const chunks = Math.floor(delay / chunk);
      for (let w = 0; w < chunks; w++) await sleep(chunk);
      if (delay % chunk > 0) await sleep(delay % chunk);
    }

    // ── Unfollow ──
    log(`${label} 🔍 @${username} — searching in Followers...`);

    try {
      await unfollowViaDialog(page, myUsername, username);
      log(`${label} ✅ @${username} — unfollowed!`);
    } catch (err) {
      const msg = err.message;
      if (msg.includes("not found in Followers") || msg.includes("already removed") || msg.includes("not following you")) {
        log(`${label} ⏭ @${username} — ${msg}`);
        skipped++;
      } else {
        log(`${label} ❌ @${username} — ${msg}`);
        errors++;
      }
    }

    // Close any lingering dialogs
    const hasDialog = await page.locator('div[role="dialog"]').isVisible().catch(() => false);
    if (hasDialog) {
      await page.keyboard.press("Escape");
      await sleep(1000);
      const stillOpen = await page.locator('div[role="dialog"]').isVisible().catch(() => false);
      if (stillOpen) {
        await page.keyboard.press("Escape");
        await sleep(500);
      }
    }

    if (!isTest) saveProgress({ completed: i + 1, errors, skipped });

    // In test mode, stop after 1
    if (isTest) {
      log(`🧪 Test complete! ✓`);
      break;
    }
  }

  // ── Done ──
  const succeeded = profiles.length - errors - skipped;
  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║              ✅ ALL DONE!                    ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
  console.log(`   ✅ ${succeeded} unfollowed`);
  console.log(`   ⏭ ${skipped} skipped (not in your followers)`);
  console.log(`   ❌ ${errors} failed`);
  console.log("");

  writeFileSync(join(__dirname, "unfollow-results.json"), JSON.stringify({
    total: profiles.length, succeeded, skipped, errors,
    completedAt: new Date().toISOString(),
  }, null, 2));
  log(`💾 Results saved to unfollow-results.json`);
  log("👋 Done!");
}

main().catch((err) => {
  console.error("❌ Fatal:", err.message);
  process.exit(1);
});
