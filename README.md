# Instagram Follower Review & Remover

> A full-stack tool to **fetch, analyze, review, and remove** Instagram followers — all from your local machine. No third-party services, no API keys, no rate limits.

![Tech Stack](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)
![Playwright](https://img.shields.io/badge/Playwright-1.61-green?logo=playwright)

---

## ✨ Features

### 📊 Dashboard
- **Suspicion scoring** — profiles are automatically scored 0–100 for bot/fake likelihood
- **Visual charts** — bar chart shows score distribution across all accounts
- **Account breakdown** — private accounts, verified, zero posts, no profile pic stats
- **Import history** — see all your past data imports

### 🔍 Review Queue
- **50 profiles per page** with pagination
- **Powerful filters** — search by username, sort by score/followers/following/posts, filter by reviewed status
- **Bulk actions** — approve, reject, or delete multiple accounts at once
- **Preview modal** — view detailed profile info, suspicion reasons, add notes
- **Keyboard shortcuts** — `J`/`K` navigate pages, `S` focus search, `A` approve, `R` reject
- **Export** — download as CSV or JSON (all or approved only)

### ⚙️ Suspicion Rules
- **12 rule fields** — followers, following, posts, profile pic, private, verified, business, username, full name, bio, account age, follower/following ratio, digits in username
- **Customizable points** — each rule has a slider (1–50 points) to weight its importance
- **Enable/disable** individual rules
- **Reset to defaults** anytime

### 🛡️ Whitelist
- Accounts you reject (= want to keep) are automatically whitelisted
- Whitelisted accounts never show up in the review queue again — even on re-fetches
- Remove from whitelist to re-evaluate

### 🔌 Connect Instagram
- **No API keys needed** — runs a JavaScript snippet inside Instagram's DevTools using YOUR live session
- **3-step process**: Copy script → Paste in Instagram console → Paste results here
- **Auto-scoring** — profiles are scored immediately after import
- **Whitelist-aware** — already-rejected accounts are skipped automatically

### 📥 Import/Export
- Upload **CSV or JSON** files
- **Drag & drop** support
- **Paste raw data** directly
- **Backup & Restore** — download all data as JSON, restore later (survives server restarts)

### 🚀 Unfollow Scripts (CLI)
Four scripts to actually remove followers from Instagram:

| Script | Method | Best For |
|---|---|---|
| `unfollow-brave.mjs` | Browser UI (search → remove) | **Primary** — safe, paced, saves progress |
| `unfollow-ui.mjs` | Browser UI (same method) | Alternative with batch/spread modes |
| `unfollow-instagram.mjs` | Instagram API | Old API-based approach |
| `fetch-instagram.mjs` | Browser scrolling | Fetch followers/following lists |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ 
- **Brave** or **Chrome** browser (with Instagram logged in)
- **pnpm** (recommended) or npm

### Installation

```bash
# Clone the repo
git clone https://github.com/abuzar310/instagra-followe-removerr.git
cd insta-follower-review

# Install dependencies
pnpm install

# Start the web app
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📖 Workflow Guide

### Step 1: Get Your Data

**Option A — Connect (Recommended):**
1. Go to **Connect** page → **Copy Script** button
2. Go to `instagram.com` in your browser (must be logged in)
3. Open DevTools (`F12`) → Console tab
4. Paste the script → press Enter
5. Wait for "📋 COPIED TO CLIPBOARD!"
6. Come back → Paste tab → paste the data → **Import & Analyze**

**Option B — Browser Extension:**
The project includes a Chrome extension (`extension/`). Load it in Chrome via `chrome://extensions` → Load unpacked.

**Option C — CLI Fetch:**
```bash
node scripts/fetch-instagram.mjs
```
Uses Playwright to open your browser, scroll through followers/following, and save to `scripts/instagram-data.json`.

**Option D — Manual CSV/JSON:**
Go to **Import** page → upload or paste your data.

### Step 2: Review Accounts

1. Go to **Review** page
2. Profiles with scores **30+** are flagged yellow, **60+** are high risk red
3. Click a profile to see **suspicion reasons** in detail
4. **Approve** (will be unfollowed) or **Reject** (whitelisted, kept forever)
5. Use **keyboard shortcuts** for speed: `A` = approve, `R` = reject, `J/K` = next/prev page

### Step 3: Customize Rules

Go to **Rules** page to adjust how profiles are scored:
- Enable/disable rules
- Adjust point values
- Add custom rules

Default rules flag accounts that:
- Follow too many people (> 1000 following)
- Have too few followers (< 50)
- Have 0 posts
- No profile picture
- Many digits in username (bot pattern)
- Low follower/following ratio

### Step 4: Remove Unwanted Followers

After reviewing, export the approved list:
```
Review page → Export → JSON — Approved only → downloads a .json file
```

Then use the **unfollow-brave** script:

```bash
# First time: start fresh
node scripts/unfollow-brave.mjs ~/Downloads/approved-accounts.json

# After a break: resume where you left off
node scripts/unfollow-brave.mjs ~/Downloads/approved-accounts.json --resume

# Start from a specific username
node scripts/unfollow-brave.mjs ~/Downloads/approved-accounts.json -u someusername
```

The script:
- Opens Brave with your existing profile (you're already logged in)
- Goes to your Instagram profile → clicks Followers
- Searches for each username → clicks Remove → confirms
- Saves progress **after every single removal**
- Auto-sessions at ~75 removals/hour with random delays
- Press **Ctrl+C** anytime to stop safely
- Resumes seamlessly with `--resume`

#### Safety Features
- ✅ Never clicks a "Remove" button without verifying the username
- ✅ Human-paced delays (48s ±15s between removals)
- ✅ Progress saved after each removal — survive crashes/shutdowns
- ✅ Session-based (auto-refreshes between batches)

---

## 🗂️ Project Structure

```
insta-follower-review/
├── src/
│   ├── app/
│   │   ├── page.tsx           # Dashboard
│   │   ├── review/page.tsx    # Review Queue
│   │   ├── import/page.tsx    # Import / Backup Restore
│   │   ├── rules/page.tsx     # Suspicion Rules
│   │   ├── whitelist/page.tsx # Whitelist
│   │   ├── connect/page.tsx   # Connect Instagram
│   │   ├── layout.tsx         # App layout + sidebar
│   │   └── globals.css        # Tailwind styles
│   ├── components/
│   │   ├── Sidebar.tsx        # Navigation sidebar
│   │   └── Avatar.tsx         # Profile avatar component
│   ├── hooks/
│   │   └── useData.ts         # Data hook (followers, rules, etc.)
│   └── lib/
│       ├── store.ts           # LocalStorage data layer + scoring engine
│       ├── types.ts           # TypeScript types
│       ├── ig-browser.ts      # Deprecated browser module
│       └── ig-scraper-script.ts # DevTools scraper script generator
├── scripts/
│   ├── unfollow-brave.mjs     # 🏆 Main unfollow script (Brave UI)
│   ├── unfollow-ui.mjs        # UI-based unfollow (alt method)
│   ├── unfollow-instagram.mjs # API-based unfollow (legacy)
│   ├── fetch-instagram.mjs    # Fetch followers via browser
│   └── README.md              # Scripts documentation
├── extension/
│   ├── manifest.json          # Chrome extension manifest
│   ├── popup.html / popup.js  # Extension popup
│   └── content.js             # Content script
├── package.json
├── next.config.ts
├── tsconfig.json
└── tailwind.config.ts
```

---

## 📊 Suspicion Scoring

Each profile is scored 0–100 based on configurable rules:

| Rule | Default Points | What It Checks |
|---|---|---|
| Low followers | 15 | Has fewer than 50 followers |
| High following | 20 | Follows more than 1000 accounts |
| Zero posts | 15 | Has 0 posts |
| No profile pic | 10 | No profile picture |
| Many digits in username | 10 | Username has 4+ digits (bot pattern) |
| Low follower ratio | 15 | Following ÷ Followers > 5 |
| Private account | 5 | Account is private |

**Score thresholds:**
- **0–19**: Safe (green)
- **20–39**: Flagged (yellow)
- **40–59**: Suspicious (orange)
- **60–100**: High risk (red)

---

## 💾 Data Persistence

All data is stored in your browser's **localStorage**:
- `ifr_followers` — all imported profiles with scores & review status
- `ifr_rules` — suspicion rules
- `ifr_batches` — import history
- `ifr_whitelist` — kept accounts

### To avoid losing data:
1. Go to **Dashboard** → click **Backup** button → downloads `.json`
2. App restarts? Go to **Import** page → **Restore Backup** → upload that file

### Unfollow Script Progress:
- Saved to `scripts/.brave-unfollow-progress.json`
- Updated after EVERY removal
- Use `--resume` to pick up where you left off

---

## 🧰 Scripts Reference

### `unfollow-brave.mjs` (🏆 Primary)
```bash
node scripts/unfollow-brave.mjs <approved.json>
node scripts/unfollow-brave.mjs <approved.json> --resume
node scripts/unfollow-brave.mjs <approved.json> -u <username>
```
- Uses your **Brave** (or Chrome) browser profile
- Searches Followers dialog → clicks Remove → confirms
- ~75 removals/hour with random delays (33–63s)
- Saves progress after every removal
- Auto-continues between sessions; press Ctrl+C to stop

### `unfollow-ui.mjs` (Alternative)
```bash
node scripts/unfollow-ui.mjs <profiles.json>
node scripts/unfollow-ui.mjs --batch <profiles.json>   # Burst mode
node scripts/unfollow-ui.mjs --test <profiles.json>    # Test 1 account
```
- Same browser UI approach with different pacing modes
- `--batch`: 5–15 accounts per burst, dynamic rests (finishes ~24h)
- `--test`: Quick test with 1 account, no delays

### `fetch-instagram.mjs`
```bash
node scripts/fetch-instagram.mjs
```
- Opens your browser → goes to profile
- Clicks Followers → scrolls to load ALL → saves
- Same for Following
- Output: `scripts/instagram-data.json`

---

## ❓ FAQ

**Q: Will Instagram ban me?**
A: The scripts simulate human behavior — ~75 removals/hour with random delays. This is well within normal usage patterns. The DevTools scraper uses your own browser session, same as browsing normally.

**Q: What if my laptop shuts down?**
A: The unfollow script saves progress **after every single removal**. Run `--resume` to continue from the last saved position. Worst case: you lose 1 account.

**Q: Can I deploy this to Vercel?**
A: The web app can be deployed to Vercel, but the unfollow scripts need a real browser (Playwright) and cannot run serverless.

**Q: My data was lost after closing the app!**
A: It's in your browser's localStorage — reopening `localhost:3000` should restore it. If the tab was cleared, use **Backup → Restore**.

**Q: The unfollow script couldn't find the Followers button?**
A: It tries 6 strategies to find and click the Followers button. If all fail, it dumps the page HTML so the selector can be fixed.

**Q: How do I adjust the unfollow speed?**
A: Edit `TARGET_PER_HOUR` and `SESSION_MINUTES` variables in `scripts/unfollow-brave.mjs`.

---

## 🔧 Troubleshooting

### "Could not find the Followers button"
The script auto-debugges by dumping visible page elements. Share that output to get the selector fixed.

### "Cannot paste in DevTools console"
Type `allow pasting` and press Enter in the console, then paste again.

### "Script takes too long to fetch"
It paginates through ALL your followers — may take 30–60s for large accounts.

### "Browser closes other windows"
The script uses Playwright's persistent context which may close existing browser instances. Save your work first.

### Port already in use
```bash
# Kill the process on port 3000
npx kill-port 3000
# Or find and kill manually
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

## 🧪 Tech Stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Language:** TypeScript
- **Styling:** [Tailwind CSS 4](https://tailwindcss.com/)
- **Charts:** [Recharts](https://recharts.org/)
- **CSV Parsing:** [PapaParse](https://www.papaparse.com/)
- **Browser Automation:** [Playwright](https://playwright.dev/) (scripts)
- **Icons:** [Lucide React](https://lucide.dev/)
- **IDs:** [uuid](https://github.com/uuidjs/uuid)

---

## 📄 License

MIT
