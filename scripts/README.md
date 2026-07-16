# Instagram Browser Automation Scripts

These scripts use **Playwright** to open YOUR real browser (Brave or Chrome) that you're already logged into Instagram on. Instagram sees it as a normal browser — **no CAPTCHA, no rate limits, no blocks!**

## Requirements

- Node.js 18+
- **Brave** or **Chrome** browser (with Instagram logged in)

## Setup

```bash
# Install Playwright (already in the project)
npm install

# Install the Chromium browser for Playwright
npx playwright install chromium
```

> 💡 **The script automatically detects Brave first, then falls back to Chrome.**
>    No configuration needed — just run it!

---

## 1️⃣ Fetch followers & following

Run this to automatically fetch your followers and following list:

```bash
node scripts/fetch-instagram.mjs
```

### What happens:

1. **Finds your Brave/Chrome profile** (where you're already logged into Instagram!)
2. **Closes any running browser windows** (to use your profile)
3. **Opens a new browser with YOUR profile** — you're already logged in!
4. **Automatically fetches** your followers and following
5. **Saves the data** to `scripts/instagram-data.json`

### After fetching:

```bash
# Import into the app:
#   Go to /import page → Upload instagram-data.json
```

---

## 2️⃣ Unfollow accounts

After reviewing accounts in the app, you can unfollow them with:

```bash
node scripts/unfollow-instagram.mjs <file.json>
```

### Example — unfollow from a JSON file:

Create a file called `to-unfollow.json`:
```json
[
  { "profileId": "123456789", "username": "botaccount1" },
  { "username": "botaccount2" }
]
```

Then run:
```bash
node scripts/unfollow-instagram.mjs to-unfollow.json
```

### Example — unfollow individual usernames:

```bash
node scripts/unfollow-instagram.mjs bot1 bot2 bot3
```

### Example — unfollow from a text file:

```bash
# Create a file with one username per line
echo "bot1" > to-unfollow.txt
echo "bot2" >> to-unfollow.txt
node scripts/unfollow-instagram.mjs --from-file to-unfollow.txt
```

### Features:
- Shares the session from the fetch script (log in once!)
- **Human-like delays** — spreads unfollows over several hours so Instagram doesn't notice
- **Auto-retry** on rate limits (waits 2 minutes then retries)
- **Progress saving** — you can Ctrl+C and resume later
- **Profile lookup** — if you only have usernames, it'll find the IDs automatically

---

## ⚠️ Important Notes

- **Your existing browser windows will close** when you run the script (it needs access to your profile)
- After the script finishes, just reopen your browser normally
- If you have unsaved work, **save it first!** The script will close all browser windows
- All data stays on YOUR computer — nothing uploaded anywhere

## How it works

The script finds your **real browser profile** (where you're already logged into Instagram) and opens it with Playwright. Since Instagram already knows your browser and sees your existing login session, **there's no CAPTCHA, no login prompts, no detection**. The script then uses Instagram's **internal API** (the same one Instagram's own web app uses) through the page context to fetch data and unfollow accounts.

This is vastly more reliable than:
- ❌ **Chrome extension content scripts** — detected as isolated world, immediately rate limited
- ❌ **Server-side Playwright** — headless mode detected and blocked
- ❌ **Login automation** — triggers CAPTCHA
- ✅ **Headed real browser with your existing session** — indistinguishable from normal usage
