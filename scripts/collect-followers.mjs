#!/usr/bin/env node

/**
 * Instagram Smart Collect
 * =======================
 *
 * Collects YOUR followers by searching alphabetically in the followers dialog.
 * Instead of using Instagram's API (which rate-limits), this script types
 * each letter (a-z, 0-9) in the search box, scrolls the filtered results,
 * and collects all usernames. No API rate limits!
 *
 * If the UI approach fails, it falls back to Instagram's internal API (same
 * as the Quick Connect API mode) — so you always get your data.
 *
 * USAGE:
 *   node scripts/collect-followers.mjs
 *
 * OUTPUT:
 *   Emits SSE events on stdout:
 *     event: log       { text: "..." }
 *     event: progress  { count: 123, letter: "a" }
 *     event: done      { followers: [...], count: 3105 }
 *     event: error     { message: "..." }
 */

import { chromium } from "playwright";
import { existsSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_FILE = join(__dirname, ".smart-collect-output.json");
const APP_ID = "936619743392459";

// ── SSE helpers ──
function send(type, data) {
  process.stdout.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

function log(msg) {
  send("log", { text: `[${new Date().toLocaleTimeString("en-IN")}] ${msg}` });
}

// ── Find browser (Brave first, then Chrome) ──
function getBrowserInfo() {
  const username = process.env.USERNAME || "Default";
  const home = `C:\\Users\\${username}`;

  const braveDir = `${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data`;
  if (existsSync(`${braveDir}\\Default`)) {
    return {
      name: "Brave",
      userDataDir: braveDir,
      exe: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
      altExe: `${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    };
  }

  const chromeDir = `${home}\\AppData\\Local\\Google\\Chrome\\User Data`;
  if (existsSync(`${chromeDir}\\Default`)) {
    return { name: "Chrome", userDataDir: chromeDir, channel: "chrome" };
  }

  return null;
}

// ── Main ──
async function main() {
  log("🔍 Looking for browser profile...");
  const browserInfo = getBrowserInfo();
  if (!browserInfo) {
    send("error", { message: "Could not find Brave or Chrome profile." });
    process.exit(1);
  }
  log(`📁 Found ${browserInfo.name} profile`);

  // ── Close running browser instances ──
  log(`🔌 Closing running ${browserInfo.name} instances...`);
  try {
    execSync(`taskkill /F /IM ${browserInfo.name === "Brave" ? "brave.exe" : "chrome.exe"}`, {
      stdio: "pipe", windowsHide: true,
    });
    await new Promise((r) => setTimeout(r, 3000));
  } catch {}

  // ── Launch browser ──
  log(`🚀 Opening ${browserInfo.name} with your profile...`);
  const launchOpts = {
    headless: false,
    args: ["--no-sandbox", "--disable-features=ChromeWhatsNewUI"],
    viewport: { width: 1280, height: 800 },
  };

  if (browserInfo.channel) {
    launchOpts.channel = browserInfo.channel;
  } else if (browserInfo.exe) {
    launchOpts.executablePath = existsSync(browserInfo.exe)
      ? browserInfo.exe
      : browserInfo.altExe;
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(browserInfo.userDataDir, launchOpts);
  } catch (e) {
    log(`⚠️ ${e.message}, trying fallback...`);
    delete launchOpts.channel;
    delete launchOpts.executablePath;
    context = await chromium.launchPersistentContext(browserInfo.userDataDir, launchOpts);
  }

  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });

  // ── Go to Instagram ──
  log("🌐 Opening Instagram...");
  try {
    await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch {}
  await new Promise((r) => setTimeout(r, 4000));

  // ── Check login ──
  const loggedIn = await checkLoggedIn(page);
  if (!loggedIn) {
    log("⚠️ Not logged in. Please log in in the browser window.");
    log("👀 Waiting for you to log in (up to 5 min)...");
    const waited = await waitForLogin(page, 300000);
    if (!waited) {
      send("error", { message: "Login timeout." });
      await context.close();
      process.exit(1);
    }
    log("✅ Logged in!");
  } else {
    log("✅ Already logged in!");
  }

  // Small pause after login
  await new Promise((r) => setTimeout(r, 2000));

  // ── Try Smart Collect (UI) first ──
  let followers = [];
  let usedMethod = "smart-collect";

  const myUsername = await getMyUsername(page);
  if (myUsername) {
    log(`👤 Logged in as @${myUsername}`);

    // Navigate to profile
    log("🌐 Going to your profile...");
    try {
      await page.goto(`https://www.instagram.com/${myUsername}/`, {
        waitUntil: "domcontentloaded", timeout: 20000,
      });
    } catch {}
    await new Promise((r) => setTimeout(r, 4000));

    // Try to click followers dialog
    log("🔍 Looking for Followers button...");
    const followersClicked = await clickFollowers(page);
    await new Promise((r) => setTimeout(r, 3000));

    if (followersClicked) {
      const dialogVisible = await page.evaluate(() => {
        return document.querySelectorAll('div[role="dialog"]').length > 0;
      });

      if (dialogVisible) {
        log("✅ Followers dialog opened! Starting smart collect...");
        log("⏳ This may take 5-10 minutes for large follower lists...");

        // Check if dialog has a search input
        const hasSearch = await page.evaluate(() => {
          const dialog = document.querySelector('div[role="dialog"]');
          if (!dialog) return false;
          return dialog.querySelector('input') !== null;
        });

        if (hasSearch) {
          followers = await smartCollect(page);
          log(`✅ Smart Collect complete: ${followers.length} followers`);
        } else {
          log("⚠️ No search input in dialog — scrolling full list instead...");
          followers = await scrollFullList(page);
          log(`✅ Scroll complete: ${followers.length} followers`);
        }
      } else {
        log("⚠️ Followers dialog didn't appear after clicking — trying API fallback...");
      }
    } else {
      log("⚠️ Could not click Followers button — trying API fallback...");
    }
  } else {
    log("⚠️ Could not get username — trying API fallback...");
  }

  // ── API Fallback ──
  if (followers.length === 0) {
    usedMethod = "api-fallback";
    log("📡 Falling back to Instagram API...");
    log("ℹ️ This may be slower and could hit rate limits (30s delay between pages)");

    const cookies = await context.cookies();
    const csrftoken = cookies.find(c => c.name === "csrftoken")?.value || "";
    const ds_user_id = cookies.find(c => c.name === "ds_user_id")?.value || "";

    if (cookies.find(c => c.name === "sessionid")?.value) {
      log("🍪 Session cookie found — API fallback ready");
    } else {
      send("error", { message: "No session cookie found. Cannot use API fallback." });
      await context.close();
      process.exit(1);
    }

    // Get user ID if we don't have it
    let userId = ds_user_id;
    if (!userId) {
      try {
        userId = await page.evaluate(async (appId) => {
          const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";
          const r = await fetch("https://www.instagram.com/api/v1/users/web_profile_info/", {
            headers: { "x-ig-app-id": appId, "x-csrftoken": csrf },
          });
          const d = await r.json();
          return d.data?.user?.id || null;
        }, APP_ID);
      } catch {}
    }

    if (!userId) {
      send("error", { message: "Could not get user ID for API fallback." });
      await context.close();
      process.exit(1);
    }

    log(`👤 User ID: ${userId}`);
    followers = await apiFetchAll(page, userId, csrftoken);
  }

  // ── Save to file ──
  if (followers.length === 0) {
    send("error", { message: "No followers collected via any method." });
    await context.close();
    process.exit(1);
  }

  log(`💾 Saving ${followers.length} followers to file...`);
  try {
    writeFileSync(OUTPUT_FILE, JSON.stringify(followers), "utf-8");
    log(`✅ Saved to ${OUTPUT_FILE}`);
  } catch (e) {
    send("error", { message: `Failed to save output file: ${e.message}` });
    await context.close();
    process.exit(1);
  }

  // ── Done ──
  if (usedMethod === "api-fallback") {
    log(`⚠️ Note: Collected via API (may have rate limit gaps for large lists)`);
  }
  log(`✅ ${usedMethod}: Collected ${followers.length} followers!`);
  send("done", { count: followers.length, file: ".smart-collect-output.json" });

  // Keep browser open for 3 seconds so user can see completion
  await new Promise((r) => setTimeout(r, 3000));
  await context.close();
  log("🔒 Browser closed. You can reopen it normally now.");
}

// ── Smart Collect: alphabet search + scroll in dialog ──
async function smartCollect(page) {
  const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
  const SEARCH_WAIT = 3000;
  const MAX_SCROLLS = 45;
  const SCROLL_WAIT = 1500;

  const allItems = [];
  const seen = new Set();

  const dialog = page.locator('div[role="dialog"]');
  
  // Try multiple approaches to find the search input
  let searchInput;
  try {
    searchInput = dialog.locator('input:not([type="hidden"])').first();
    // Verify it works
    await searchInput.isEnabled({ timeout: 2000 });
  } catch {
    // Try other selectors
    try {
      searchInput = dialog.locator('[contenteditable="true"]').first();
    } catch {
      return allItems;
    }
  }

  for (let c = 0; c < CHARS.length; c++) {
    const char = CHARS[c];

    // Type the character
    try {
      await searchInput.fill("");
      await new Promise((r) => setTimeout(r, 300));
      await searchInput.fill(char);
    } catch {
      // If search input broke, collect whatever we have
      break;
    }

    // Wait for Instagram to filter results
    await new Promise((r) => setTimeout(r, SEARCH_WAIT));

    // Scroll within this letter's results
    let sameCount = 0;
    let beforeCount = allItems.length;

    for (let s = 0; s < MAX_SCROLLS; s++) {
      const items = await extractVisibleUsers(page);
      let added = 0;
      for (const item of items) {
        if (!seen.has(item.username)) {
          seen.add(item.username);
          allItems.push(item);
          added++;
        }
      }

      if (added === 0) {
        sameCount++;
        if (sameCount >= 4) break;
      } else {
        sameCount = 0;
      }

      // Scroll the dialog
      await scrollDialog(page);
      await new Promise((r) => setTimeout(r, SCROLL_WAIT + Math.random() * 500));
    }

    const newInLetter = allItems.length - beforeCount;
    send("progress", { letter: char, count: allItems.length, newInLetter });
    log(`🔤 '${char.toUpperCase()}': +${newInLetter} new · ${allItems.length} total`);
  }

  return allItems;
}

// ── Scroll full list (fallback if no search input) ──
async function scrollFullList(page) {
  const allItems = [];
  const seen = new Set();
  const MAX_SCROLLS = 200;
  const SCROLL_WAIT = 2000;

  log("📜 Scrolling full followers list (this may take a while)...");

  for (let s = 0; s < MAX_SCROLLS; s++) {
    const items = await extractVisibleUsers(page);
    let added = 0;
    for (const item of items) {
      if (!seen.has(item.username)) {
        seen.add(item.username);
        allItems.push(item);
        added++;
      }
    }

    if (added === 0 && s > 5) {
      log(`📜 Stopped scrolling — no new items for ${s + 1} rounds`);
      break;
    }

    await scrollDialog(page);
    await new Promise((r) => setTimeout(r, SCROLL_WAIT + Math.random() * 1000));

    if (s % 10 === 0 && s > 0) {
      log(`📜 Scroll ${s}: ${allItems.length} total`);
    }
  }

  return allItems;
}

// ── Scroll the dialog ──
async function scrollDialog(page) {
  await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return;
    const scrollables = dialog.querySelectorAll("div");
    let best = null, bestH = 0;
    for (const div of scrollables) {
      const h = div.scrollHeight;
      const style = window.getComputedStyle(div);
      const maxH = parseInt(style.maxHeight) || 0;
      const ov = style.overflowY + style.overflow;
      if (h > bestH && (ov.includes("auto") || ov.includes("scroll") || maxH > 0)) {
        bestH = h; best = div;
      }
    }
    if (best) best.scrollTop = best.scrollHeight;
    else dialog.scrollTop = dialog.scrollHeight;
  });
}

// ── Extract visible users from the dialog ──
async function extractVisibleUsers(page) {
  return await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return [];

    const items = [];
    // Broader selector - Instagram uses various link structures
    const links = dialog.querySelectorAll(
      'a[href^="/"]:not([href*="/p/"]):not([href*="/reel/"]):not([href*="/explore/"]):not([href*="/direct/"]):not([href*="/accounts/"]):not([href*="/stories/"]):not([href*="/tags/"])'
    );

    for (const a of links) {
      const href = a.getAttribute("href");
      if (!href || href === "/") continue;
      const username = href.replace(/^\/|\/$/g, "");
      if (!username || username.length < 2 || username.includes("?")) continue;
      // Skip Instagram system pages
      if (["accounts", "direct", "explore", "stories", "login", "settings", "about"].includes(username)) continue;

      let fullName = "";
      const spans = a.querySelectorAll("span");
      for (const s of spans) {
        const t = s.textContent.trim();
        if (t && t !== username && t.length > 0 && t.length < 100) { fullName = t; break; }
      }

      let profilePic = "";
      const img = a.querySelector("img");
      if (img) profilePic = img.getAttribute("src") || "";

      const pkMatch = profilePic.match(/stories%2F([^%]+)/) ||
                      profilePic.match(/\/(\d+)_\d+_\d+/);
      const pk = pkMatch ? pkMatch[1] : username;

      items.push({ username, full_name: fullName, profile_pic_url: profilePic, pk });
    }

    return items;
  });
}

// ── Click followers button (multiple strategies) ──
async function clickFollowers(page) {
  try {
    // Strategy 1: Direct href link
    const link = await page.$('a[href*="/followers/"]');
    if (link) {
      log("📌 Found followers link via href");
      await link.click();
      return true;
    }

    // Strategy 2: Look for elements containing follower count text
    const result = await page.evaluate(() => {
      // Try all interactive elements with number+followers text
      const candidates = document.querySelectorAll('a, button, span, div, section, li, p, [role="link"], [role="button"]');
      for (const el of candidates) {
        const txt = (el.textContent || "").trim().toLowerCase();
        // Match patterns like "1,234 followers", "1.2K followers", "3105 followers"
        if (/^[\d,.k]+ ?followers?$/i.test(txt) || /^followers?[\s\S]*[\d,.k]+$/i.test(txt)) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            el.click();
            return { found: true, text: txt, method: "text-match" };
          }
        }
      }
      return { found: false };
    });

    if (result.found) {
      log(`📌 Found followers via text: "${result.text}"`);
      return true;
    }

    // Strategy 3: XPath for links containing "followers"
    try {
      const xpathResult = await page.evaluate(() => {
        const xpath = "//a[contains(translate(text(), 'FOLLOWERS', 'followers'), 'follower')]";
        const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        const node = result.singleNodeValue;
        if (node) {
          node.click();
          return true;
        }
        return false;
      });
      if (xpathResult) {
        log("📌 Found followers via XPath");
        return true;
      }
    } catch {}

    // Strategy 4: Look for aria-label on parent elements
    const ariaResult = await page.evaluate(() => {
      for (const el of document.querySelectorAll("[aria-label], [title]")) {
        const aria = (el.getAttribute("aria-label") || el.getAttribute("title") || "").toLowerCase();
        if (aria.includes("follower") && !aria.includes("following")) {
          el.click();
          return true;
        }
      }
      return false;
    });
    if (ariaResult) {
      log("📌 Found followers via aria-label");
      return true;
    }

    log("❌ Could not find Followers button with any strategy");
    return false;
  } catch (e) {
    log(`⚠️ Error clicking followers: ${e.message}`);
    return false;
  }
}

// ── API Fallback: fetch followers using Instagram's internal API ──
async function apiFetchAll(page, userId, csrftoken) {
  const items = [];
  let nextMaxId = null;
  const MAX_PAGES = 30;

  log(`📡 API: Fetching followers via Instagram API...`);

  for (let i = 0; i < MAX_PAGES; i++) {
    let url = `https://i.instagram.com/api/v1/friendships/${userId}/followers/?count=200`;
    if (nextMaxId) url += `&max_id=${encodeURIComponent(nextMaxId)}`;

    try {
      const result = await page.evaluate(async (u, csrf, appId) => {
        const res = await fetch(u, {
          headers: {
            "x-ig-app-id": appId,
            "x-csrftoken": csrf,
            "referer": "https://www.instagram.com/",
          },
        });
        const d = await res.json();
        return { ok: d.status !== "fail", data: d, status: res.status };
      }, url, csrftoken, APP_ID);

      if (!result.ok) {
        log(`⚠️ API error on page ${i + 1}: ${result.data?.message || "Unknown"}`);
        break;
      }

      const users = result.data.users || [];
      for (const u of users) {
        items.push({
          username: u.username,
          full_name: u.full_name || "",
          profile_pic_url: u.profile_pic_url || "",
          pk: u.pk || u.id || u.username,
          source: "api",
        });
      }

      log(`📥 API page ${i + 1}: ${items.length} followers`);

      nextMaxId = result.data.next_max_id || null;
      if (!nextMaxId) {
        log("📥 No more pages (reached end)");
        break;
      }

      // Rate limit safety delay
      const delay = 30000 + Math.random() * 10000;
      log(`⏳ Waiting ${Math.round(delay / 1000)}s before next page (rate limit safety)...`);
      await new Promise((r) => setTimeout(r, delay));
    } catch (e) {
      log(`⚠️ Fetch error on page ${i + 1}: ${e.message}`);
      break;
    }
  }

  return items;
}

// ── Check logged in ──
async function checkLoggedIn(page) {
  try {
    const hasSession = await page.evaluate(() => document.cookie.includes("sessionid="));
    if (hasSession) return true;
    const url = page.url();
    if (url.includes("login")) return false;
    return await page.$('input[name="username"]') === null;
  } catch { return false; }
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

// ── Get username ──
async function getMyUsername(page) {
  try {
    const url = page.url();
    const m = url.match(/instagram\.com\/([^\/\?#]+)/);
    if (m && !["accounts","direct","explore","stories","login","settings","about"].includes(m[1])) return m[1];
  } catch {}

  try {
    const cookies = await page.context().cookies();
    const dsUser = cookies.find(c => c.name === "ds_user_id");
    if (dsUser?.value) {
      const username = await page.evaluate(async (appId) => {
        const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";
        const r = await fetch("https://www.instagram.com/api/v1/users/web_profile_info/", {
          headers: { "x-ig-app-id": appId, "x-csrftoken": csrf },
        });
        const d = await r.json();
        return d.data?.user?.username || null;
      }, APP_ID);
      if (username) return username;
    }
  } catch {}

  return null;
}

main().catch((err) => {
  send("error", { message: err.message || "Unknown error" });
  process.exit(1);
});
