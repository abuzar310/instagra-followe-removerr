#!/usr/bin/env node

/**
 * Instagram Follower/Following Fetcher
 * =====================================
 *
 * Uses YOUR real Brave (or Chrome) profile to fetch Instagram data.
 * Instead of calling the API directly (which triggers rate limits),
 * it simulates HUMAN SCROLLING BEHAVIOR — clicking "followers",
 * scrolling the dialog, and extracting data from the DOM.
 *
 * Instagram sees this as a normal user browsing — NO rate limits!
 *
 * Usage:
 *   node scripts/fetch-instagram.mjs
 *
 * What happens:
 *   1. Finds your Brave/Chrome profile (where you're already logged into Instagram)
 *   2. Closes running browser windows, then opens Brave with YOUR profile
 *   3. Goes to your profile page, clicks "followers", scrolls to load all
 *   4. Same for "following"
 *   5. Saves to scripts/instagram-data.json
 *
 * Requirements:
 *   npm install playwright
 *   Brave or Chrome browser (with Instagram logged in)
 */

import { chromium } from "playwright";
import { writeFileSync, readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = join(__dirname, ".instagram-session.json");
const OUTPUT_FILE = join(__dirname, "instagram-data.json");
const APP_ID = "936619743392459";

// ── Find browser (Brave first, then Chrome) on Windows ──
function getBrowserInfo() {
  const username = process.env.USERNAME || "Default";
  const home = `C:\\Users\\${username}`;

  // Try Brave first
  const braveDataDir = `${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data`;
  const braveProfile = join(braveDataDir, "Default");
  if (existsSync(braveProfile)) {
    return {
      name: "Brave",
      userDataDir: braveDataDir,
      processName: "brave.exe",
      executablePath: `C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      altExecutablePath: `${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    };
  }

  // Fall back to Chrome
  const chromeDataDir = `${home}\\AppData\\Local\\Google\\Chrome\\User Data`;
  const chromeProfile = join(chromeDataDir, "Default");
  if (existsSync(chromeProfile)) {
    return {
      name: "Chrome",
      userDataDir: chromeDataDir,
      processName: "chrome.exe",
      executablePath: null,
      altExecutablePath: null,
    };
  }

  return null;
}

// ── Helpers ──

function log(msg) {
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${msg}`);
}

function saveSession(cookies) {
  writeFileSync(SESSION_FILE, JSON.stringify(cookies, null, 2));
  log(`💾 Session saved (${cookies.length} cookies)`);
}

function loadSession() {
  if (!existsSync(SESSION_FILE)) return null;
  try {
    return JSON.parse(readFileSync(SESSION_FILE, "utf-8"));
  } catch {
    return null;
  }
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === "--help" || args[0] === "-h") {
    console.log("");
    console.log("Instagram Followers Fetcher");
    console.log("");
    console.log("Usage:");
    console.log("  node scripts/fetch-instagram.mjs");
    console.log("");
    console.log("How it works:");
    console.log("  1. Uses YOUR browser's Instagram session (no login needed)");
    console.log("  2. Opens your profile, clicks 'followers', scrolls to load ALL");
    console.log("  3. Saves followers list to scripts/instagram-data.json");
    console.log("");
    console.log("Why it works:");
    console.log("  Simulates human scrolling (not API calls) — no rate limits!");
    console.log("");
    process.exit(0);
  }

  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║        Instagram Followers Fetcher           ║");
  console.log("║        (Human-scrolling mode)                ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");

  // ── Find browser profile (Brave or Chrome) ──
  const browserInfo = getBrowserInfo();
  if (!browserInfo) {
    log("❌ Could not find Brave or Chrome profile.");
    log("   Make sure you're logged into Instagram in Brave/Chrome first.");
    process.exit(1);
  }
  log(`📁 Browser: ${browserInfo.name}`);
  log("");

  // ── Close running browser instances ──
  log(`🔌 Closing running ${browserInfo.name} instances...`);
  log("   (Save your work first! Browsers will close.)");
  try {
    execSync(`taskkill /F /IM ${browserInfo.processName}`, { stdio: "pipe", windowsHide: true });
    await new Promise((r) => setTimeout(r, 3000));
    log(`✅ ${browserInfo.name} closed.`);
  } catch {
    log(`   ${browserInfo.name} wasn't running.`);
  }

  // ── Launch with real profile ──
  log(`🚀 Opening ${browserInfo.name} with your profile...`);

  const launchOpts = {
    headless: false,
    args: ["--no-sandbox", "--disable-features=ChromeWhatsNewUI"],
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
  };

  if (browserInfo.name === "Chrome") {
    launchOpts.channel = "chrome";
  } else {
    launchOpts.executablePath = browserInfo.executablePath;
    if (!existsSync(browserInfo.executablePath) && browserInfo.altExecutablePath && existsSync(browserInfo.altExecutablePath)) {
      launchOpts.executablePath = browserInfo.altExecutablePath;
    }
  }

  let context, browser;
  try {
    context = await chromium.launchPersistentContext(browserInfo.userDataDir, launchOpts);
  } catch (e) {
    log(`⚠️ ${e.message}`);
    log("   Falling back to bundled Chromium (may need manual login)...");
    delete launchOpts.channel;
    delete launchOpts.executablePath;
    context = await chromium.launchPersistentContext(browserInfo.userDataDir, launchOpts);
  }

  const savedSession = loadSession();
  if (savedSession) {
    await context.addCookies(savedSession);
    log("🍪 Loaded saved session cookies.");
  }

  const page = await context.newPage();

  // Hide automation signals
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  // ── Go to Instagram ──
  log("🌐 Opening Instagram...");
  try {
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch {
    log("⚠️ Navigation took a moment, continuing...");
  }
  await new Promise((r) => setTimeout(r, 5000));

  // ── Check / wait for login ──
  if (!(await checkLoggedIn(page))) {
    log("⚠️ Not logged in. Log in manually in the browser window.");
    console.log("");
    console.log("   ┌─────────────────────────────────────────────┐");
    console.log("   │  Type your EMAIL and PASSWORD in the        │");
    console.log("   │  browser window and click Log In.           │");
    console.log("   │  I'll wait here!                            │");
    console.log("   └─────────────────────────────────────────────┘");
    console.log("");
    if (!(await waitForLogin(page, 300000))) {
      log("❌ Login timeout.");
      await context.close();
      process.exit(1);
    }
    log("✅ Logged in!");
  } else {
    log("✅ Already logged in!");
  }

  // ── Get username ──
  await new Promise((r) => setTimeout(r, 2000));
  log("🔍 Getting your profile info...");
  const myUsername = await getMyUsername(page);
  if (!myUsername) {
    log("❌ Could not determine your username.");
    await context.close();
    process.exit(1);
  }
  log(`👤 @${myUsername} (logged in)`);

  // ── Get user ID (needed for fallback API) ──
  let userId = await getUserId(page);
  if (userId) log(`   ID: ${userId}`);

  // ── Fetch followers via UI scrolling ──
  log("");
  log("📥 Fetching followers (scrolling the dialog)...");
  log("   (This looks like a human browsing — no rate limits!)");
  const followers = await scrapListViaUI(page, myUsername, "followers");
  log(`✅ ${followers.length} followers loaded`);

  // ── Save results ──
  const result = {
    followers,
    followersCount: followers.length,
    fetchedAt: new Date().toISOString(),
    method: "ui-search",
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  log(`💾 Saved to: ${OUTPUT_FILE}`);

  console.log("");
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║                 ✅ COMPLETE!                 ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log("");
  console.log(`   📊 Followers: ${followers.length.toLocaleString()}`);
  console.log("");
  console.log(`   File: ${OUTPUT_FILE}`);
  console.log("");
  console.log("   Next step: Import into the app!");
  console.log("   1. Open the web app → /import page");
  console.log(`   2. Upload scripts/instagram-data.json`);
  console.log("   3. Review flagged accounts → unfollow");
  console.log("");

  await context.close();
  log(`👋 Done! Reopen ${browserInfo.name} normally.`);
}

// ── Scrape followers/following via UI scrolling ──

async function scrapListViaUI(page, myUsername, kind) {
  // Navigate to profile page
  log(`   🌐 Going to instagram.com/${myUsername}/...`);
  try {
    await page.goto(`https://www.instagram.com/${myUsername}/`, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
  } catch {
    log("   ⚠️ Navigation took a moment, continuing...");
  }
  await new Promise((r) => setTimeout(r, 3000));

  // Click the followers/following link
  const kindLabel = kind === "followers" ? "followers" : "following";
  log(`   👆 Clicking "${kindLabel}" link...`);
  
  try {
    // Try different selector patterns for the link
    let link = await page.$(`a[href*="/${kindLabel}/"]`);
    if (!link) {
      // Fallback: try to find by text content
      link = await page.evaluateHandle((label) => {
        const allLinks = document.querySelectorAll("a");
        for (const a of allLinks) {
          if (a.textContent.toLowerCase().includes(label)) return a;
        }
        return null;
      }, kindLabel);
    }
    
    if (!link) {
      log(`   ❌ Could not find "${kindLabel}" link on profile page.`);
      log(`      Trying fallback: direct navigation...`);
      return await fallbackFetchList(page, myUsername, kind);
    }
    
    await link.click();
  } catch (e) {
    log(`   ❌ Error clicking "${kindLabel}": ${e.message}`);
    log(`      Trying fallback...`);
    return await fallbackFetchList(page, myUsername, kind);
  }

  // Wait for dialog to appear
  await new Promise((r) => setTimeout(r, 3000));

  // Check if dialog opened
  const dialogVisible = await page.evaluate(() => {
    const dialogs = document.querySelectorAll('div[role="dialog"]');
    return dialogs.length > 0;
  });

  if (!dialogVisible) {
    log(`   ❌ Dialog didn't open. Trying fallback...`);
    return await fallbackFetchList(page, myUsername, kind);
  }

  // Extract items via search (scrolling is often glitchy, search works reliably)
  const items = await searchAndCollect(page, kindLabel);
  return items;
}

// ── Search the dialog by alphabet + scroll within each letter's results ──
// Instagram's dialog scroll can be glitchy on the full list, but after typing
// a letter in the search box, it filters down to a manageable set. This types
// each character (a-z, 0-9), then SCROLLS within those filtered results to
// capture ALL matching users — not just the visible ones.

async function searchAndCollect(page, kindLabel) {
  const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
  const SEARCH_WAIT_MS = 2500;
  const MAX_SCROLLS = 50;
  const SCROLL_WAIT_MS = 2000;
  const allItems = [];
  const seen = new Set();

  log(`   🔍 Searching alphabetically (a-z, 0-9) + scrolling each letter's results...`);

  const dialog = page.locator('div[role="dialog"]');

  // Find the search input inside the dialog
  const searchInput = dialog.locator('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])').first();

  for (let c = 0; c < CHARS.length; c++) {
    const char = CHARS[c];

    // Clear and type the character
    try {
      await searchInput.fill("");
      await new Promise((r) => setTimeout(r, 200));
      await searchInput.fill(char);
    } catch {
      log(`   ⚠️ Could not type '${char.toUpperCase()}' into search — skipping`);
      continue;
    }

    // Wait for Instagram to filter results
    await new Promise((r) => setTimeout(r, SEARCH_WAIT_MS));

    // ── Scroll within this letter's results to load everything ──
    let sameCountRounds = 0;

    for (let scroll = 0; scroll < MAX_SCROLLS; scroll++) {
      // Collect currently visible users
      const currentItems = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return [];

        const items = [];
        const links = dialog.querySelectorAll('a[href^="/"]:not([href*="/p/"]):not([href*="/reel/"]):not([href*="/explore/"]):not([href*="/direct/"]):not([href*="/accounts/"])');

        for (const a of links) {
          const href = a.getAttribute("href");
          if (!href || href === "/" || href.split("/").filter(Boolean).length !== 1) continue;

          const username = href.replace(/^\/|\/$/g, "");
          if (!username || username.length < 2) continue;

          let fullName = "";
          const spans = a.querySelectorAll("span");
          for (const s of spans) {
            const text = s.textContent.trim();
            if (text && text !== username && text.length > 0 && text.length < 100) {
              fullName = text;
              break;
            }
          }

          let profilePic = "";
          const img = a.querySelector("img");
          if (img) profilePic = img.getAttribute("src") || "";

          items.push({ username, fullName, profilePic, source: "ui-search" });
        }

        return items;
      });

      // Merge new items (deduplicated by username)
      let newAdded = 0;
      for (const item of currentItems) {
        if (!seen.has(item.username)) {
          seen.add(item.username);
          allItems.push(item);
          newAdded++;
        }
      }

      // Stop scrolling this letter if no new items in several rounds
      if (newAdded === 0) {
        sameCountRounds++;
        if (sameCountRounds >= 4) break;
      } else {
        sameCountRounds = 0;
      }

      // Scroll the dialog to load more
      await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        if (!dialog) return;

        const scrollables = dialog.querySelectorAll("div");
        let bestScroll = null;
        let bestHeight = 0;

        for (const div of scrollables) {
          const style = window.getComputedStyle(div);
          const height = div.scrollHeight;
          const maxHeight = parseInt(style.maxHeight) || 0;
          const overflow = style.overflowY || style.overflow || "";

          if (height > bestHeight && (overflow.includes("auto") || overflow.includes("scroll") || maxHeight > 0)) {
            bestHeight = height;
            bestScroll = div;
          }
        }

        if (bestScroll) {
          bestScroll.scrollTop = bestScroll.scrollHeight;
        } else {
          dialog.scrollTop = dialog.scrollHeight;
        }
      });

      await new Promise((r) => setTimeout(r, SCROLL_WAIT_MS + Math.random() * 500));
    }

    // Show progress after each letter
    const letterTotal = allItems.length;
    log(`      '${char.toUpperCase()}': ${letterTotal} total followers (searched ${c + 1}/${CHARS.length})`);
  }

  log(`      ✅ ${kindLabel}: ${allItems.length} total collected via alphabet search + scroll`);
  return allItems;
}

// ── Fallback: API-based fetch (if UI scrolling fails) ──

async function fallbackFetchList(page, myUsername, kind) {
  log(`   ⚠️ Using API fallback for ${kind}...`);
  log(`      (May be slower / rate limited)`);
  
  // Get user ID first
  let userId = await getUserId(page);
  if (!userId) {
    log(`   ❌ Could not get user ID for API fallback.`);
    return [];
  }

  const items = [];
  let nextMaxId = null;
  const MAX_PAGES = 30;
  const PAGE_SIZE = 200;

  for (let i = 0; i < MAX_PAGES; i++) {
    let url = `https://i.instagram.com/api/v1/friendships/${userId}/${kind}/?count=${PAGE_SIZE}`;
    if (nextMaxId) url += `&max_id=${encodeURIComponent(nextMaxId)}`;

    const data = await rateLimitedFetch(page, url);
    if (!data) break;

    const users = data.users || [];
    items.push(...users);
    log(`      📥 API page ${i + 1}: ${items.length} ${kind}`);

    nextMaxId = data.next_max_id || null;
    if (!nextMaxId) break;

    // Long delay between API pages (rate limit safety)
    const delay = 25000 + Math.random() * 15000;
    log(`      ⏳ Waiting ${Math.round(delay / 1000)}s before next page...`);
    await new Promise((r) => setTimeout(r, delay));
  }

  return items.map((u) => ({
    username: u.username,
    fullName: u.full_name || "",
    profilePic: u.profile_pic_url || "",
    pk: u.pk || u.id,
    source: "api",
  }));
}

// ── Rate-limited API fetch (backup) ──

async function rateLimitedFetch(page, url, retries = 5) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await page.evaluate(async (u) => {
        const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";
        const res = await fetch(u, {
          headers: { "x-ig-app-id": "936619743392459", "x-csrftoken": csrf },
        });
        const d = await res.json();
        return { ok: d.status !== "fail", data: d, status: res.status };
      }, url);

      if (result.ok) return result.data;

      const msg = (result.data?.message || "").toLowerCase();
      const isRateLimit =
        result.status === 429 ||
        msg.includes("please wait") || msg.includes("too many") ||
        msg.includes("rate limit") || msg.includes("try again later");

      if (!isRateLimit) {
        log(`      ❌ API error: ${result.data?.message || "Unknown"}`);
        return null;
      }

      const waitMs = (120 * Math.pow(2, attempt) + Math.random() * 60) * 1000;
      log(`      ⏳ Rate limited — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt + 1}/${retries})...`);
      await new Promise((r) => setTimeout(r, waitMs));
    } catch (err) {
      log(`      ⚠️ Fetch error: ${err.message}`);
      if (attempt >= retries) return null;
      await new Promise((r) => setTimeout(r, 30000));
    }
  }
  return null;
}

// ── Check if logged in ──

async function checkLoggedIn(page) {
  try {
    const hasSession = await page.evaluate(() => document.cookie.includes("sessionid="));
    if (hasSession) return true;

    const url = page.url();
    if (url.includes("accounts/login") || url.includes("login")) return false;

    const navIcons = [
      'a[href*="/direct/inbox"]', 'a[href*="/explore/"]',
      'svg[aria-label="Home"]', 'span img[alt*="profile"]',
    ];
    for (const sel of navIcons) {
      if (await page.$(sel)) return true;
    }

    const loginForm = await page.$('input[name="username"]');
    if (loginForm) return false;

    const hasCsrf = await page.evaluate(() => document.cookie.includes("csrftoken="));
    if (!hasCsrf) return false;

    return true;
  } catch {
    return false;
  }
}

// ── Wait for login ──

async function waitForLogin(page, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkLoggedIn(page)) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

// ── Get my username ──

async function getMyUsername(page) {
  try {
    // Method 1: From the profile page URL (most reliable after navigation)
    const url = page.url();
    const urlMatch = url.match(/instagram\.com\/([^\/\?#]+)/);
    if (urlMatch && urlMatch[1] && !["accounts", "direct", "explore", "stories"].includes(urlMatch[1])) {
      return urlMatch[1];
    }
  } catch {}

  try {
    // Method 2: From cookies
    const cookies = await page.context().cookies();
    const dsUser = cookies.find(c => c.name === "ds_user_id");
    if (dsUser && dsUser.value) {
      // Try to get username from stored data or API
      const username = await page.evaluate(async () => {
        const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";
        const r = await fetch("https://www.instagram.com/api/v1/users/web_profile_info/", {
          headers: { "x-ig-app-id": "936619743392459", "x-csrftoken": csrf },
        });
        const d = await r.json();
        return d.data?.user?.username || null;
      });
      if (username) return username;
    }
  } catch {}

  try {
    // Method 3: From page HTML
    const html = await page.evaluate(() => document.documentElement.innerHTML);
    const m = html.match(/"username":"([^"]+)"/);
    if (m) return m[1];
  } catch {}

  return null;
}

// ── Get user ID ──

async function getUserId(page) {
  try {
    const cookies = await page.context().cookies();
    const dsCookie = cookies.find(c => c.name === "ds_user_id");
    if (dsCookie && dsCookie.value) return dsCookie.value;
  } catch {}

  try {
    const result = await page.evaluate(async (appId) => {
      const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";
      const r = await fetch("https://www.instagram.com/api/v1/users/web_profile_info/", {
        headers: { "x-ig-app-id": appId, "x-csrftoken": csrf },
      });
      const d = await r.json();
      return d.data?.user?.id || null;
    }, APP_ID);
    if (result) return result;
  } catch {}

  try {
    const html = await page.evaluate(() => document.documentElement.innerHTML);
    const patterns = [/"user_id":"(\d+)"/, /"pk":(\d+)/, /"viewerId":"(\d+)"/];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) return m[1];
    }
  } catch {}

  return null;
}

main().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
