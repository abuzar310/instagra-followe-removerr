/* ── DevTools Console Script ──
 *
 * This generates a JS snippet the user pastes into Instagram's DevTools
 * console. The script runs INSIDE their browser (where they're already
 * logged in) and uses Instagram's internal API to fetch followers/following.
 *
 * Usage:
 *   1. Go to instagram.com in Chrome/Firefox
 *   2. Open DevTools (F12) → Console tab
 *   3. Paste the generated script
 *   4. Wait for "📋 Copied to clipboard!" message
 *   5. Come back here and paste the data
 */

export function generateScraperScript(): string {
  return `(async function scrapeIG() {
  const APP_ID = "936619743392459";
  const MAX_PAGES = 50;
  const PAGE_SIZE = 200;

  function csrf() {
    const m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? m[1] : "";
  }

  // Helper: fetch with rate-limit retry
  async function rateLimitedFetch(url, opts, retries) {
    retries = retries || 5;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const res = await fetch(url, opts);
      const data = await res.json();

      if (data.status !== "fail") return data;

      const msg = (data.message || "").toLowerCase();
      const isRateLimit =
        res.status === 429 ||
        msg.includes("please wait") ||
        msg.includes("too many") ||
        msg.includes("rate limit") ||
        msg.includes("try again later");

      if (!isRateLimit) {
        throw new Error(data.message || "API returned fail");
      }

      if (attempt >= retries) {
        throw new Error("Instagram is still rate limiting after " + (retries + 1) + " attempts. " + (data.message || "Wait 10-15 min and try again."));
      }

      const waitMs = (60 * Math.pow(2, attempt) + Math.random() * 30) * 1000;
      console.log("⏳ Rate limited, waiting " + Math.round(waitMs / 1000) + "s (attempt " + (attempt + 1) + "/" + retries + ")...");
      await new Promise(r => setTimeout(r, waitMs));
    }
  }

  // Step 1: Get current user ID from the web profile API
  console.log("🔍 Getting user info...");
  let userId = null;
  try {
    const r = await fetch("https://www.instagram.com/api/v1/users/web_profile_info/", {
      headers: { "x-ig-app-id": APP_ID, "x-csrftoken": csrf() }
    });
    const d = await r.json();
    userId = d.data?.user?.id;
  } catch (e) {
    // Fallback: try from the page payload
    console.warn("Web profile API failed, trying HTML fallback...", e);
  }
  // Last resort fallback
  if (!userId) {
    const html = document.documentElement.innerHTML;
    const m = html.match(/"user_id":"(\\d+)"/) || html.match(/"pk":(\\d+)/);
    if (m) userId = m[1];
  }
  if (!userId) {
    console.error("❌ Could not determine your user ID. Make sure you're logged in and on instagram.com");
    console.log("Try: go to your profile page, then run this script again.");
    return;
  }
  console.log("✅ User ID:", userId);

  // Helper: fetch one endpoint with pagination
  async function fetchList(kind) {
    const items = [];
    let nextMaxId = null;
    for (let i = 0; i < MAX_PAGES; i++) {
      let url = "https://i.instagram.com/api/v1/friendships/" + userId + "/" + kind + "/?count=" + PAGE_SIZE;
      if (nextMaxId) url += "&max_id=" + encodeURIComponent(nextMaxId);

      const data = await rateLimitedFetch(url, {
        headers: { "x-ig-app-id": APP_ID, "x-csrftoken": csrf() }
      });

      const users = data.users || [];
      items.push(...users);
      console.log("📥 " + items.length + " " + kind + " fetched...");
      nextMaxId = data.next_max_id || null;
      if (!nextMaxId) break;

      // Conservative delay between pages: 3-8 seconds to avoid rate limits
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 5000));
    }
    return items;
  }

  // Step 2: Fetch followers
  console.log("\\n📡 Fetching followers...");
  const followers = await fetchList("followers");
  console.log("✅ " + followers.length + " followers");

  // Step 3: Fetch following
  console.log("📡 Fetching following...");
  const following = await fetchList("following");
  console.log("✅ " + following.length + " following");

  // Step 4: Package and copy
  const result = {
    followers,
    following,
    followersCount: followers.length,
    followingCount: following.length,
    fetchedAt: new Date().toISOString()
  };
  const json = JSON.stringify(result);

  try {
    await navigator.clipboard.writeText(json);
    console.log("\\n📋 COPIED TO CLIPBOARD!");
  } catch {
    console.warn("⚠️ Clipboard copy failed. Copy the JSON below manually:");
    console.log(json);
  }

  console.log("\\n🎉 Done! Followers:", followers.length, "Following:", following.length);
  console.log("Now paste the data into the Insta Follower Review app.");
  console.log("\\n(Data size: ~" + Math.round(json.length / 1024) + " KB)");
})();`;
}
