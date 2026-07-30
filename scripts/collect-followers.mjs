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
 * USAGE:
 *   node scripts/collect-followers.mjs
 *
 * OUTPUT:
 *   Emits SSE events on stdout:
 *     event: log
 *     data: {"text": "..."}
 *
 *     event: progress
 *     data: {"count": 123, "letter": "a"}
 *
 *     event: done
 *     data: {"followers": [{username, full_name, profile_pic_url, pk}, ...], "count": 3105}
 *
 *     event: error
 *     data: {"message": "..."}
 */

import { chromium } from "playwright";
import { existsSync } from "fs";
import { execSync } from "child_process";

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
  // ── Find browser ──
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
    send("log", { text: "👀 Waiting for you to log in (up to 5 min)..." });
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

  // ── Get username ──
  await new Promise((r) => setTimeout(r, 2000));
  const myUsername = await getMyUsername(page);
  if (!myUsername) {
    send("error", { message: "Could not determine your username." });
    await context.close();
    process.exit(1);
  }
  log(`👤 Logged in as @${myUsername}`);

  // ── Open profile page ──
  log("🌐 Going to your profile...");
  try {
    await page.goto(`https://www.instagram.com/${myUsername}/`, {
      waitUntil: "domcontentloaded", timeout: 20000,
    });
  } catch {}
  await new Promise((r) => setTimeout(r, 3000));

  // ── Click followers ──
  log("🔍 Opening followers dialog...");
  const clicked = await clickFollowers(page);
  if (!clicked) {
    send("error", { message: "Could not find the Followers button." });
    await context.close();
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 2000));
  log("✅ Followers dialog opened!");

  // ── Smart Collect: alphabet search + scroll ──
  log("🔤 Starting Smart Collect — searching a-z, 0-9...");
  send("log", { text: "📋 This may take 5-10 minutes for large follower lists..." });

  const followers = await smartCollect(page);

  // ── Done ──
  log(`✅ Collected ${followers.length} followers!`);
  await context.close();
  log("🔒 Browser closed.");

  send("done", { followers, count: followers.length });
}

// ── Smart Collect: alphabet search + scroll ──
async function smartCollect(page) {
  const CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
  const SEARCH_WAIT = 2500;
  const MAX_SCROLLS = 40;
  const SCROLL_WAIT = 1500;

  const allItems = [];
  const seen = new Set();

  const dialog = page.locator('div[role="dialog"]');
  const searchInput = dialog.locator("input").first();

  for (let c = 0; c < CHARS.length; c++) {
    const char = CHARS[c];

    // Type the character
    try {
      await searchInput.fill("");
      await new Promise((r) => setTimeout(r, 200));
      await searchInput.fill(char);
    } catch {
      continue;
    }

    // Wait for Instagram to filter
    await new Promise((r) => setTimeout(r, SEARCH_WAIT));

    // Scroll within this letter's results
    let sameCount = 0;
    let beforeCount = allItems.length;

    for (let s = 0; s < MAX_SCROLLS; s++) {
      // Collect visible users
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
        if (sameCount >= 3) break;
      } else {
        sameCount = 0;
      }

      // Scroll the dialog
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

      await new Promise((r) => setTimeout(r, SCROLL_WAIT + Math.random() * 500));
    }

    const newInLetter = allItems.length - beforeCount;
    beforeCount = allItems.length;

    send("progress", { letter: char, count: allItems.length, newInLetter });
    log(`🔤 '${char.toUpperCase()}': +${newInLetter} new · ${allItems.length} total`);
  }

  return allItems;
}

// ── Extract visible users from the dialog ──
async function extractVisibleUsers(page) {
  return await page.evaluate(() => {
    const dialog = document.querySelector('div[role="dialog"]');
    if (!dialog) return [];

    const items = [];
    const links = dialog.querySelectorAll(
      'a[href^="/"]:not([href*="/p/"]):not([href*="/reel/"]):not([href*="/explore/"]):not([href*="/direct/"]):not([href*="/accounts/"])'
    );

    for (const a of links) {
      const href = a.getAttribute("href");
      if (!href || href === "/") continue;
      const username = href.replace(/^\/|\/$/g, "");
      if (!username || username.length < 2 || username.includes("?")) continue;

      let fullName = "";
      const spans = a.querySelectorAll("span");
      for (const s of spans) {
        const t = s.textContent.trim();
        if (t && t !== username && t.length < 100) { fullName = t; break; }
      }

      let profilePic = "";
      const img = a.querySelector("img");
      if (img) profilePic = img.getAttribute("src") || "";

      // Try to get pk from img src (Instagram embeds user ID in URLs)
      const pkMatch = profilePic.match(/stories%2F([^%]+)/) ||
                      profilePic.match(/\/(\d+)_\d+_\d+/);
      const pk = pkMatch ? pkMatch[1] : username;

      items.push({ username, full_name: fullName, profile_pic_url: profilePic, pk });
    }

    return items;
  });
}

// ── Click followers button ──
async function clickFollowers(page) {
  try {
    const result = await page.evaluate(() => {
      // Priority: href link, interactive elements with number+followers text
      const link = document.querySelector('a[href*="/followers/"]');
      if (link) { link.click(); return true; }

      const interactive = document.querySelectorAll('a, button, [role="link"], [role="button"]');
      for (const el of interactive) {
        const txt = (el.textContent || "").trim();
        if (/^[\d,]+ ?followers?$/i.test(txt)) {
          el.click(); return true;
        }
      }

      // Fallback: any element with number+followers
      const all = document.querySelectorAll("span, div, li, p, section");
      for (const el of all) {
        const txt = (el.textContent || "").trim();
        if (/^[\d,]+ ?followers?$/i.test(txt)) {
          el.click(); return true;
        }
      }

      return false;
    });

    if (result) return true;

    // Try aria labels
    return await page.evaluate(() => {
      for (const el of document.querySelectorAll("[aria-label], [title]")) {
        const aria = (el.getAttribute("aria-label") || el.getAttribute("title") || "").toLowerCase();
        if (aria.includes("follower") && !aria.includes("following")) {
          el.click(); return true;
        }
      }
      return false;
    });
  } catch {
    return false;
  }
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
    if (m && !["accounts","direct","explore","stories","login"].includes(m[1])) return m[1];
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
      }, "936619743392459");
      if (username) return username;
    }
  } catch {}

  return null;
}

main().catch((err) => {
  send("error", { message: err.message || "Unknown error" });
  process.exit(1);
});
