# Instagram Follower Review & Remover

> A full-stack tool to **fetch, analyze, review, and remove** Instagram followers — all from your local machine. No third-party services, no API keys required, no rate limits.

![Tech Stack](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss)
![Playwright](https://img.shields.io/badge/Playwright-1.61-green?logo=playwright)

---

## 📋 Table of Contents

- [✨ Features](#-features)
- [🚀 Quick Start](#-quick-start)
- [📖 Workflow Guide](#-workflow-guide)
  - [Step 1: Connect Instagram](#step-1-connect-instagram-3-ways)
  - [Step 2: Review Accounts](#step-2-review-accounts)
  - [Step 3: Customize Rules](#step-3-customize-rules)
  - [Step 4: Remove Followers](#step-4-unfollow)
- [📊 Suspicion Scoring](#-suspicion-scoring)
- [🗂️ Project Structure](#️-project-structure)
- [🧰 Scripts Reference](#-scripts-reference)
- [💾 Data Persistence](#-data-persistence)
- [❓ FAQ](#-faq)
- [🔧 Troubleshooting](#-troubleshooting)

---

## ✨ Features

### 🔌 3 Ways to Connect Instagram

| Method | How | Best For |
|--------|-----|----------|
| **⚡ Quick Connect** | One click — browser pops up, captures session, auto-fetches | **Fastest** — already logged in on your computer |
| **🔑 Manual Login** | Type username/password in the app, auto-fills, handles 2FA | When you want to log in fresh |
| **📟 DevTools Script** | Copy script → paste in Instagram console → paste data back | **Fallback** — runs in your own browser, no automation needed |

### 📊 Dashboard
- **Suspicion scoring** — profiles are automatically scored 0–100 for bot/fake likelihood
- **Visual charts** — bar chart shows score distribution across all accounts
- **Account breakdown** — private accounts, verified, zero posts, no profile pic stats
- **Import history** — see all your past data imports
- **Backup & Restore** — export all data as JSON, restore later

### 🔍 Review Queue
- **50 profiles per page** with pagination
- **Powerful filters** — search by username, sort by score/followers/following/posts, filter by reviewed/approved/private/verified
- **Bulk actions** — approve, reject, or delete multiple accounts at once
- **Preview modal** — view detailed profile info, suspicion reasons, add notes
- **Keyboard shortcuts** — `J`/`K` navigate pages, `S` focus search, `A` approve, `R` reject
- **Export** — download as CSV or JSON (all or approved only)
- **Auto-Run unfollow** — click "Start Unfollow" → choose **Manual** (terminal command) or **Auto-Run** (in-app with live progress bar, stop button, block detection)

### ⚙️ Suspicion Rules
- **12 rule fields** — followers, following, posts, profile pic, private, verified, business, username, full name, bio, account age, follower/following ratio, digits in username
- **Customizable points** — each rule has a slider (1–50 points) to weight its importance
- **Enable/disable** individual rules
- **Reset to defaults** anytime

### 🛡️ Whitelist
- Accounts you reject (= want to keep) are automatically whitelisted
- Whitelisted accounts never show up in the review queue again — even on re-fetches
- Remove from whitelist to re-evaluate

### 🚀 Unfollow Scripts (CLI)
Four scripts to actually remove followers from Instagram:

| Script | Method | Best For |
|--------|--------|----------|
| `unfollow-brave.mjs` | Browser UI (search → remove) | **Primary** — safe, paced, auto-block detection, saves progress |
| `unfollow-ui.mjs` | Browser UI (same method) | Alternative with batch/spread modes |
| `unfollow-instagram.mjs` | Instagram API | Old API-based approach |
| `fetch-instagram.mjs` | Browser scrolling | Fetch followers/following lists |

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **pnpm** (recommended) or npm
- **Brave** or **Chrome** browser (for Quick Connect method, make sure you're logged into Instagram)
- **Playwright browsers** installed (for Quick Connect / Manual Login):

```bash
npx playwright install chromium
```

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

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 📖 Workflow Guide

### Step 1: Connect Instagram (3 Ways)

#### ⚡ Method A: Quick Connect (Fastest — 1 Click)

> **Requirement:** You must be logged into Instagram in your Brave or Chrome browser.

1. Go to the **Connect** page
2. Make sure **Quick Connect** tab is selected
3. Click **"Quick Connect"** button
4. A browser window will briefly open and close (this captures your Instagram session)
5. Your followers and following **load automatically** in the app
6. Done! Go to **Review** page

*What happens behind the scenes:* The app uses Playwright to open your real browser profile (where Instagram knows you). It captures your session cookies, then uses Instagram's API to fetch your followers and following. The browser window closes automatically. No scripts, no copy-paste.

---

#### 🔑 Method B: Manual Login

1. Go to the **Connect** page
2. Select **Manual Login** tab
3. Type your **Instagram username** (or email) and **password**
4. Click **"Login & Fetch"**
5. A browser window opens — the app fills in your credentials automatically
6. If you have **2FA enabled**, complete the code/challenge in the browser window
7. Once logged in, the browser closes and your data loads automatically

*Security:* Your credentials stay on YOUR machine. They are typed directly into Instagram's login page (via Playwright) — never sent to any server.

---

#### 📟 Method C: DevTools Script (Fallback)

Use this if the automated methods don't work, or if you prefer a fully manual approach:

1. Go to the **Connect** page → **DevTools Script** tab
2. Click **"Copy Script"** to copy the JavaScript snippet
3. Open `instagram.com` in your browser (must be logged in)
4. Press **F12** to open DevTools → go to **Console** tab
5. **Paste** the script and press **Enter**
6. Wait for **"📋 COPIED TO CLIPBOARD!"** message
7. Come back to the app → **Paste** tab
8. Paste the data → click **"Import & Analyze"**

*Troubleshooting:*
- Can't paste in the console? Type `allow pasting` and press Enter first
- Nothing copied? The script prints the output in the console — right-click and copy manually

---

> 💡 **Tip:** You can also use the terminal script `node scripts/fetch-instagram.mjs` to fetch followers via browser scrolling. It saves to `scripts/instagram-data.json` — then use the **Import** page to upload and analyze.

### Step 2: Review Accounts

1. Go to the **Review** page
2. Profiles with scores **30+** are flagged yellow, **60+** are high risk red
3. Click a profile to see **suspicion reasons** in detail
4. **Approve** (checked = will be unfollowed) or **Reject** (kept forever)
5. Use **keyboard shortcuts** for speed:
   - `A` = approve, `R` = reject
   - `J` = previous page, `K` = next page
   - `S` = focus search

### Step 3: Customize Rules

Go to the **Rules** page to adjust how profiles are scored:

- Slide to change point values (1–50)
- Toggle rules on/off
- Add custom rules

**Default rules flag accounts that:**

| Rule | Points | What It Checks |
|------|--------|---------------|
| Zero posts | **30** | Account has 0 posts |
| Few followers (<20) | **25** | Has fewer than 20 followers |
| High following (>2000) | **20** | Follows more than 2000 accounts |
| No profile pic | **20** | No profile picture |
| Many digits in username | **15** | Username has 5+ digits (bot pattern) |
| Following >> followers | **25** | Follower/following ratio < 0.1 |
| Not verified | **5** | Account is not verified |
| Private account | **10** | Account is private |

### Step 4: Unfollow

After reviewing all accounts, you have two ways to unfollow:

#### Option A: Auto-Run (In-App)

1. Go to the **Review** page
2. Click **"Start Unfollow"**
3. Select the **Auto-Run** tab
4. Click **"Start Auto-Run"**
5. Watch live progress — bar, stats, and log update in real-time
6. The script **auto-stops** if Instagram blocks you (4+ consecutive "not found" errors)
7. Click **Stop** anytime — progress is saved, resume with `--resume`

#### Option B: Manual (Terminal)

1. On the Review page, click **"Start Unfollow"** → **Manual** tab
2. Copy the terminal command shown
3. Run it in your terminal:

```bash
node scripts/unfollow-brave.mjs ~/Downloads/to-unfollow.json
```

**Resume after stopping:**
```bash
node scripts/unfollow-brave.mjs ~/Downloads/to-unfollow.json --resume
```

**Start from a specific account:**
```bash
node scripts/unfollow-brave.mjs ~/Downloads/to-unfollow.json -u someusername
```

The script will:
- Open your Brave/Chrome browser (with your profile where you're already logged in)
- Go to your Instagram profile → click Followers
- Search for each approved username → click Remove → confirm
- Save progress **after every single removal**
- Press **Ctrl+C** anytime to stop safely
- Resume seamlessly with `--resume`

---

## 📊 Suspicion Scoring

Each profile is scored **0–100** based on your configurable rules:

| Score Range | Color | Meaning |
|-------------|-------|---------|
| **0–19** | 🟢 Green | Normal account |
| **20–39** | 🟡 Yellow | Flagged — review |
| **40–59** | 🟠 Orange | Suspicious |
| **60–100** | 🔴 Red | High risk — likely bot/fake |

---

## 🗂️ Project Structure

```
insta-follower-review/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Dashboard
│   │   ├── review/page.tsx             # Review Queue + Unfollow Dialog
│   │   ├── import/page.tsx             # Import / Backup Restore
│   │   ├── rules/page.tsx              # Suspicion Rules
│   │   ├── whitelist/page.tsx          # Whitelist
│   │   ├── connect/page.tsx            # Connect Instagram (3 methods)
│   │   ├── layout.tsx                  # App layout + sidebar
│   │   ├── globals.css                 # Tailwind styles
│   │   └── api/
│   │       ├── instagram/
│   │       │   ├── auth/route.ts       # 🔐 Quick Connect + Manual Login (Playwright)
│   │       │   ├── fetch/route.ts      # 📡 Fetch followers/following via Instagram API
│   │       │   ├── proxy/route.ts      # 🔗 Proxy route for Instagram API calls
│   │       │   └── browser/            # Legacy browser routes
│   │       └── unfollow/
│   │           ├── run/route.ts        # ▶️ Auto-run unfollow with SSE streaming
│   │           └── stop/route.ts       # ⏹ Stop running unfollow process
│   ├── components/
│   │   ├── Sidebar.tsx                 # Navigation sidebar
│   │   └── Avatar.tsx                  # Profile avatar component
│   ├── hooks/
│   │   ├── useData.ts                  # Data hook (followers, rules, etc.)
│   │   └── useUnfollowStream.ts        # 🔄 SSE hook for auto-run unfollow progress
│   └── lib/
│       ├── store.ts                    # LocalStorage data layer + scoring engine
│       ├── types.ts                    # TypeScript types
│       ├── utils.ts                    # Shared utilities (downloadFile)
│       └── ig-scraper-script.ts        # DevTools scraper script generator
├── scripts/
│   ├── unfollow-brave.mjs              # 🏆 Main unfollow script (with block detection)
│   ├── unfollow-ui.mjs                 # UI-based unfollow (alt method)
│   ├── unfollow-instagram.mjs          # API-based unfollow (legacy)
│   └── fetch-instagram.mjs             # Fetch followers via browser scrolling
├── package.json
├── next.config.ts
├── tsconfig.json
└── README.md
```

---

## 🧰 Scripts Reference

### `unfollow-brave.mjs` (🏆 Primary)

```bash
# Start fresh
node scripts/unfollow-brave.mjs <approved.json>

# Resume after stopping
node scripts/unfollow-brave.mjs <approved.json> --resume

# Start from a specific username
node scripts/unfollow-brave.mjs <approved.json> -u <username>

# Furious mode (faster, less delay between removals)
node scripts/unfollow-brave.mjs <approved.json> -f
```

**Features:**
- ✅ Uses your **Brave** (or Chrome) browser profile
- ✅ Searches the Followers dialog → clicks Remove → confirms
- ✅ **Auto-block detection** — stops after 4+ consecutive "not found" errors (Instagram rate limit)
- ✅ **Furious mode** (`-f`) — faster pacing for users who want speed over safety
- ✅ Saves progress after every removal
- ✅ Auto-continues between sessions
- ✅ Press **Ctrl+C** anytime to stop safely

### `unfollow-ui.mjs` (Alternative)

```bash
node scripts/unfollow-ui.mjs <profiles.json>
node scripts/unfollow-ui.mjs --batch <profiles.json>   # Burst mode
node scripts/unfollow-ui.mjs --test <profiles.json>    # Test 1 account
```

### `fetch-instagram.mjs`

```bash
node scripts/fetch-instagram.mjs
```

- Opens your browser → goes to profile
- Clicks Followers → scrolls to load ALL → saves
- Same for Following
- Output: `scripts/instagram-data.json`

---

## 💾 Data Persistence

### App Data (Browser localStorage)

All data is stored in your browser's **localStorage**:

| Key | What it stores |
|-----|---------------|
| `ifr_followers` | All imported profiles with scores & review status |
| `ifr_rules` | Suspicion rules configuration |
| `ifr_batches` | Import history |
| `ifr_whitelist` | Kept accounts |

**To avoid losing data:**
1. Go to **Dashboard** → click **Backup** → downloads `.json` file
2. App restarted? Go to **Import** page → **Restore Backup** → upload that file

### Unfollow Script Progress

| File | Contents |
|------|----------|
| `scripts/.brave-unfollow-progress.json` | Current progress of the unfollow script |
| `scripts/brave-removal-results.json` | Final results after completion |

---

## ❓ FAQ

**Q: Will Instagram ban me?**
A: No. The scripts simulate human behavior — ~75 removals/hour with random delays. The Quick Connect method uses your real browser profile (same as logging in normally). This is well within normal usage patterns.

**Q: What if my laptop shuts down during unfollow?**
A: The script saves progress **after every single removal**. Run `--resume` to continue from the last saved position. Worst case: you lose 1 account.

**Q: The Quick Connect / Manual Login opens a browser — is that safe?**
A: Yes. Playwright opens your real Brave/Chrome browser with your profile. Your credentials are typed directly into Instagram's login page (on your machine) — never sent to any server. The browser closes automatically after capturing the session.

**Q: Can I deploy this to Vercel?**
A: The web app can be deployed to Vercel, but the unfollow scripts and Quick Connect login need a real browser (Playwright) and cannot run serverless. Run locally for full functionality.

**Q: My data was lost after closing the app!**
A: It's in your browser's localStorage — reopening `localhost:3000` should restore it. If the tab data was cleared, use **Dashboard → Backup → Restore** if you have a backup file.

**Q: The unfollow script couldn't find the Followers button?**
A: It tries multiple strategies to find and click the Followers button. If all fail, it dumps the page HTML so the selector can be fixed for newer Instagram layouts.

**Q: Quick Connect says "Could not find browser profile"?**
A: Make sure you have Brave or Chrome installed and have logged into Instagram at least once. The app looks for your browser's profile folder in the default Windows location.

---

## 🔧 Troubleshooting

### "Could not find browser profile"
- Make sure **Brave** or **Chrome** is installed
- Make sure you've logged into Instagram in that browser at least once
- The app looks in: `C:\Users\YOURNAME\AppData\Local\BraveSoftware\Brave-Browser\User Data\Default`

### Quick Connect closes my browser tabs
Playwright needs exclusive access to your browser profile, so it closes running browser instances. **Save your work before clicking Quick Connect.**

### "Cannot paste in DevTools console"
Type `allow pasting` and press Enter in the console, then paste again.

### Auto-Run unfollow not working
Make sure the app is running (`pnpm dev`), the unfollow script is in the `scripts/` directory, and you have Node.js installed.

### Port already in use
```bash
# Kill the process on port 3000
npx kill-port 3000
# Or find and kill manually
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Playwright not installed
If Quick Connect or Manual Login fails with a Playwright error:
```bash
npx playwright install chromium
```

---

## 🧪 Tech Stack

| Technology | Purpose |
|-----------|---------|
| [Next.js 16](https://nextjs.org/) (App Router) | Web framework |
| TypeScript | Language |
| [Tailwind CSS 4](https://tailwindcss.com/) | Styling |
| [Recharts](https://recharts.org/) | Charts |
| [PapaParse](https://www.papaparse.com/) | CSV parsing |
| [Playwright](https://playwright.dev/) | Browser automation (login + unfollow scripts) |
| [Lucide React](https://lucide.dev/) | Icons |
| [uuid](https://github.com/uuidjs/uuid) | ID generation |

---

## 📄 License

MIT
