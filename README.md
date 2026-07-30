<div align="center">

# 📸 Instagram Follower Remover

**Fetch → Analyze → Review → Cross-Check → Remove — All from your local machine.**

[![Next.js](https://img.shields.io/badge/Next.js_16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Playwright](https://img.shields.io/badge/Playwright_1.61-45ba4b?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Recharts](https://img.shields.io/badge/Recharts-22c55e?logo=react&logoColor=white)](https://recharts.org/)
[![pnpm](https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)

**No third-party services · Your data stays on your machine 🛡️**

</div>

---

## 📋 Table of Contents

- [Features Overview](#-features-overview)
- [Quick Start](#-quick-start)
- [Full Workflow Guide](#-full-workflow-guide)
  - [Step 1: Connect Instagram](#step-1-connect-instagram)
  - [Step 2: Review & Score Profiles](#step-2-review--score-profiles)
  - [Step 3: AI Analysis](#step-3-ai-analysis-optional)
  - [Step 4: Follower Health Cross-Check](#step-4-follower-health-cross-check)
  - [Step 5: Unfollow](#step-5-unfollow)
- [Suspicion Scoring Rules](#-suspicion-scoring-rules)
- [Keyboard Shortcuts](#-keyboard-shortcuts)
- [Project Structure](#-project-structure)
- [Scripts Reference](#-scripts-reference)
- [Data Storage & Privacy](#-data-storage--privacy)
- [FAQ](#-faq)
- [Troubleshooting](#-troubleshooting)
- [Tech Stack](#-tech-stack)

---

## ✨ Features Overview

| Feature | Description |
|---------|-------------|
| **🔌 3 Ways to Connect** | Quick Connect (1-click), Manual Login (with 2FA), DevTools Script (fallback) |
| **🤖 AI Profile Analysis** | Optional AI-powered bot/fake detection using your own API key |
| **📊 Smart Scoring Engine** | 12 configurable rules with custom point values |
| **🔍 Review Queue** | Paginated profiles with inline preview, bulk actions, export |
| **✅ Follower Cross-Check** | Check live which accounts still follow you vs already unfollowed |
| **🚀 Auto-Run Unfollow** | In-app with real-time progress bar, stats, and live logs |
| **🔥 Furious Mode** | Fast-paced unfollow with no delays (use with caution) |
| **🛡️ Block Detection** | Auto-stops when Instagram rate-limits you |
| **↪️ Skip Already Unfollowed** | Accounts that left you are tracked separately & skipped |
| **💾 Persistent Progress** | Resume unfollow anytime with `--resume` |
| **📥 Backup & Restore** | Export all data as JSON, import to restore |

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Details |
|-------------|---------|
| **Node.js** | 18+ |
| **Package manager** | pnpm (recommended) or npm |
| **Browser** | Brave or Chrome (with Instagram logged in for Quick Connect) |
| **Playwright browsers** | `npx playwright install chromium` |

### Installation

```bash
git clone https://github.com/abuzar310/instagram-follower-remover.git
cd instagram-follower-remover

pnpm install
npx playwright install chromium

pnpm dev
```

Open **[http://localhost:3000](http://localhost:3000)** 🚀

---

## 📖 Full Workflow Guide

### Step 1: Connect Instagram

Choose your favorite method on the **Connect** page:

#### ⚡ Quick Connect (Fastest — 1 Click)

> ✅ Must be logged into Instagram in your Brave or Chrome browser.

1. Go to **Connect** → **Quick Connect** tab
2. Click **"Quick Connect"**
3. A Brave/Chrome window opens briefly → captures your session → closes
4. Followers & following **load automatically**
5. Head to the **Review** page

*Behind the scenes: Playwright opens your real browser profile, grabs session cookies, then fetches data via Instagram's API.*

#### 🔑 Manual Login (with 2FA Support)

1. **Connect** → **Manual Login** tab
2. Enter username & password
3. Click **"Login & Fetch"**
4. Browser opens, credentials filled automatically
5. Complete 2FA in the browser if needed
6. Data loads automatically

#### 📟 DevTools Script (Most Reliable Fallback)

1. **Connect** → **DevTools Script** → **Copy Script**
2. Open `instagram.com` in your browser (logged in)
3. Press **F12** → **Console** → paste → Enter
4. Wait for **"📋 COPIED!"** in console
5. Come back → **Paste** tab → paste → **Import & Analyze**

---

### Step 2: Review & Score Profiles

After importing, head to the **Review** page:

```
┌─ Review Queue ─────────────────────────────────────┐
│ 1,440 profiles · 1,099 reviewed · ✓ 450 · ✗ 649   │
│                                                    │
│ [Score ↓] [Search...] [Review Status ▼] [Export ▼] │
│                                                    │
│ ┌─────────────────────────────────────────────────┐ │
│ │ 🟢 @real_user        Score: 12  · 1.2K followers │ │
│ │ 🟡 @suspicious_acct  Score: 35  · 2 followers    │ │
│ │ 🔴 @bot_12345        Score: 78  · 0 posts       │ │
│ └─────────────────────────────────────────────────┘ │
│                                                    │
│ [← Prev]  1 · 2 · 3 ··· 29  [Next →]              │
└────────────────────────────────────────────────────┘
```

**Features:**
- **Color-coded:** 🟢 0-19 (safe), 🟡 20-39 (flagged), 🟠 40-59 (suspicious), 🔴 60-100 (high risk)
- **Sort by:** Score, Followers, Following, Posts, Username, Date
- **Search:** Type any username to filter
- **Filter by:** All, Reviewed, Pending, Approved, Rejected, Private, Verified
- **Bulk actions:** Select multiple → Approve / Keep / Delete
- **Preview modal:** Click any profile to see full details + suspicion reasons
- **Export:** CSV or JSON (all or approved only)

---

### Step 3: AI Analysis (Optional)

> 🔌 Uses your own OpenAI-compatible API key (e.g., Kintio, OpenAI, etc.)

Configure in **Settings** → then click **"AI Analyze"** on any profile preview:

```
┌─ AI Analysis ─────────────────────────────────────┐
│                                                     │
│   🤖 BOT DETECTED (92% confidence)                  │
│                                                     │
│   Reasons:                                          │
│   • Username contains excessive digits               │
│   • Follower/following ratio is unnatural            │
│   • No profile picture and account is new            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

The AI considers: username, bio, follower/following/posts counts, profile pic, private/verified/business status, account age, and external URL.

---

### Step 4: Follower Health Cross-Check

> **New!** Standalone feature — checks ALL your followers live on Instagram without unfollowing.

Go to **Cross-Check** in the sidebar → Click **"Start Health Check"** :

```
┌─ Follower Health Check ────────────────────────────┐
│                                                     │
│   ✅ 1,200 Verified (still follow you)               │
│   ❌  200 Unfollowed (already left)                  │
│   ⚠️   20 Errors (couldn't check)                   │
│                                                     │
│   ████████████████░░░░░░░░░  85%                    │
│                                                     │
│   Logs:                                             │
│   [12:30:45] ✅ @real_user — still following you     │
│   [12:30:48] ✗ @left_me — unfollowed you            │
│   [12:30:51] ✅ @another_user — still following you  │
│                                                     │
└─────────────────────────────────────────────────────┘
```

After completion, browse the searchable results table:
- **Verified** ✅ — Still follows you
- **Unfollowed** ❌ — Already left, no action needed
- **Error** ⚠️ — Couldn't check

Results persist in your data — come back anytime to view.

---

### Step 5: Unfollow

After reviewing, click **"Start Unfollow"** on the Review page:

#### ▶️ Auto-Run (In-App)

```
┌─ Start Unfollow ───────────────────────────────────┐
│                                                     │
│  [Manual CLI]  [▶️ Auto-Run]                        │
│                                                     │
│  ┌─ Follower Cross-Check ────────────────────────┐  │
│  │ 👥 Before unfollowing, checks live followers   │  │
│  │    to skip accounts that already left          │  │
│  │    ✅ 450 approved                             │  │
│  └────────────────────────────────────────────────┘  │
│                                                     │
│  [Skip already unfollowed]  ●━━━━━━━━━○  ON         │
│  [🔥 Furious Mode]           ○━━━━━━━━━●  OFF        │
│                                                     │
│  📍 Start From: [First account ▼]                   │
│                                                     │
│  [▶️ Start Auto-Run]                                │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Real-time progress during run:**

```
┌─ Running... ───────────────────────────────────────┐
│  🔥 Furious Mode ON                                 │
│  ████████████████░░░░░░░░░░░  65%                   │
│  ✓ 292 removed · ↪️ 15 already unfollowed            │
│  ⏭ 5 skipped · ❌ 0 errors                          │
│                                                     │
│  [12:30:45] ✅ @bot_123 — removed!                  │
│  [12:30:46] ↪️ @ghost — already unfollowed you      │
│  [12:30:47] ✅ @spammy — removed!                   │
│                                                     │
│  [■ Stop]                                           │
└─────────────────────────────────────────────────────┘
```

**Auto-stop:** If 4+ accounts in a row are "not found", Instagram has rate-limited you. The script saves progress and stops automatically.

#### 💻 Manual CLI (Terminal)

```bash
# Export approved accounts from Review → Export → JSON — Approved only
# Then run:

node scripts/unfollow-brave.mjs to-unfollow.json              # Start fresh
node scripts/unfollow-brave.mjs to-unfollow.json --resume      # Resume
node scripts/unfollow-brave.mjs to-unfollow.json -u username   # From username
node scripts/unfollow-brave.mjs to-unfollow.json -n 50         # From account #50
node scripts/unfollow-brave.mjs to-unfollow.json -f            # Furious mode
node scripts/unfollow-brave.mjs to-unfollow.json \
  --skip-not-following                                        # Skip already unfollowed
```

---

## ⚙️ Suspicion Scoring Rules

Customize on the **Rules** page — adjust points (1-50) and enable/disable each rule:

| Rule | Points | What It Detects |
|------|:------:|-----------------|
| Zero posts | **30** | Account has 0 posts |
| Few followers (<20) | **25** | Has fewer than 20 followers |
| High following (>2000) | **20** | Follows more than 2000 accounts |
| Following >> followers | **25** | Ratio < 0.1 (follows way more than followers) |
| No profile pic | **20** | Default/blank profile picture |
| Many digits in username | **15** | Username has 5+ digits (bot pattern) |
| Private account | **10** | Account is private |
| Not verified | **5** | Account is not verified |
| Many followers (>1000) | **5** | Has more than 1000 followers |
| Business account | **5** | Account is a business profile |
| No bio | **10** | Empty profile bio |
| Long username | **5** | Username longer than 15 characters |
| Account age < 30 days | **20** | Recently created account |
| High post count (>1000) | **5** | Suspiciously high number of posts |
| Username pattern | **15** | Bot-like naming patterns (e.g., `user_12345`) |

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|:---:|--------|
| `A` | **Approve** current preview (will be unfollowed) |
| `R` | **Reject** current preview (whitelisted, kept forever) |
| `J` | Next page |
| `K` | Previous page |
| `S` | Focus search box |
| `Esc` | Close preview / Save notes |

---

## 🗂️ Project Structure

```
instagram-follower-remover/
├── src/
│   ├── app/
│   │   ├── page.tsx                       # 📊 Dashboard — overview stats + chart
│   │   ├── review/page.tsx                # 🔍 Review Queue + Unfollow Dialog
│   │   ├── cross-check/page.tsx           # ✅ Follower Health Check (NEW)
│   │   ├── import/page.tsx                # 📥 Import / Backup Restore
│   │   ├── rules/page.tsx                 # ⚙️ Suspicion Rules config
│   │   ├── whitelist/page.tsx             # 🛡️ Whitelist management
│   │   ├── settings/page.tsx              # 🔧 AI API Settings (NEW)
│   │   ├── connect/page.tsx               # 🔌 Connect Instagram (3 methods)
│   │   ├── layout.tsx                     # 🧩 App layout + sidebar navigation
│   │   ├── globals.css                    # 🎨 Tailwind global styles
│   │   └── api/
│   │       ├── instagram/
│   │       │   ├── auth/route.ts          # 🔐 Quick Connect + Manual Login
│   │       │   └── fetch/route.ts         # 📡 Fetch followers via API
│   │       ├── ai/
│   │       │   └── analyze/route.ts       # 🤖 AI Profile Analysis (NEW)
│   │       ├── cross-check/
│   │       │   └── run/route.ts           # ✅ Cross-Check SSE stream (NEW)
│   │       └── unfollow/
│   │           ├── run/route.ts           # ▶️ Auto-run unfollow (SSE)
│   │           └── stop/route.ts          # ⏹ Stop unfollow process
│   ├── components/
│   │   ├── Sidebar.tsx                    # 🧭 Navigation sidebar
│   │   └── Avatar.tsx                     # 👤 Profile avatar
│   ├── hooks/
│   │   ├── useData.ts                     # 📦 Data hook for followers
│   │   └── useUnfollowStream.ts           # 🔄 SSE hook for auto-run
│   └── lib/
│       ├── store.ts                       # 💾 LocalStorage + scoring engine
│       ├── types.ts                       # 📐 TypeScript types
│       ├── utils.ts                       # 🔧 Shared utilities
│       └── ig-scraper-script.ts           # 📜 DevTools script generator
├── scripts/
│   ├── unfollow-brave.mjs                 # 🏆 Main unfollow script (Playwright)
│   ├── check-followers.mjs                # ✅ Cross-check only script (NEW)
│   ├── fetch-instagram.mjs                # Fetch followers via browser scrolling
│   ├── unfollow-instagram.mjs             # Legacy API-based unfollow
│   └── unfollow-ui.mjs                    # Legacy UI-based unfollow
├── package.json
├── next.config.ts
└── tsconfig.json
```

---

## 🧰 Scripts Reference

### `unfollow-brave.mjs` 🏆 Primary Unfollow Script

Opens Brave/Chrome → Instagram profile → Followers dialog → Searches & removes each account.

```bash
node scripts/unfollow-brave.mjs <file>                        # Start fresh
node scripts/unfollow-brave.mjs <file> --resume                # Resume
node scripts/unfollow-brave.mjs <file> -u <username>           # From username
node scripts/unfollow-brave.mjs <file> -n <number>             # From account #
node scripts/unfollow-brave.mjs <file> -f                      # Furious mode
node scripts/unfollow-brave.mjs <file> --skip-not-following    # Skip already unfollowed
```

| Feature | Description |
|---------|-------------|
| ✅ Uses your real browser login | Opens Brave/Chrome with your profile |
| ✅ Safe search verification | Verifies username before clicking Remove |
| ✅ Auto-block detection | Stops after 4 consecutive "not found" errors |
| ✅ Progress saved after every removal | Resume anytime with `--resume` |
| ✅ 🔥 Furious mode | `-f` for no-delay fast passes |
| ✅ ↪️ Skip already unfollowed | Tracks accounts that already left separately |
| ⏱ Normal pace | ~390 removals/hour with human-like delays |
| 📦 Session size | ~357 accounts per session, auto-continues |

### `check-followers.mjs` ✅ Cross-Check Script

**NEVER removes anyone** — only checks your live followers list to see who's still following you.

```bash
node scripts/check-followers.mjs <followers.json>
```

- Opens browser → Instagram profile → Followers dialog
- Searches each account — if found → "verified", if not found → "unfollowed"
- Results saved with `cross_check_status` field

### `fetch-instagram.mjs`

Fetches followers/following via browser UI scrolling (no API rate limits).

```bash
node scripts/fetch-instagram.mjs
# Output: scripts/instagram-data.json
```

---

## 💾 Data Storage & Privacy

### All data stays on YOUR machine:

| Storage | Location | What |
|---------|----------|------|
| **Follower data** | Browser localStorage | Profiles, scores, review status |
| **Rules config** | Browser localStorage | Scoring rules & points |
| **Whitelist** | Browser localStorage | Accounts to keep forever |
| **Import history** | Browser localStorage | Batch timestamps & counts |
| **AI API key** | Browser localStorage (optional) | Your API key for AI analysis |
| **AI API key** | `.env.local` (optional) | Server-side fallback |
| **Unfollow progress** | `scripts/.brave-unfollow-progress.json` | Resume state |
| **Instagram cookies** | **Never stored** | Captured in-memory, discarded after fetch |

### Backup & Restore

1. **Dashboard** → **Backup** → downloads `ifr-backup.json`
2. **Import** → **Restore Backup** → select your backup file

> 🔒 Your Instagram credentials are NEVER sent to any server. Quick Connect uses your real browser session, and manual login types directly into Instagram's own login page on your machine.

---

## ❓ FAQ

<details>
<summary><strong>Will Instagram ban me?</strong></summary>
No. The scripts simulate human behavior — ~75 removals/hour with random delays, real browser interactions, and session breaks. This is well within normal usage patterns.
</details>

<details>
<summary><strong>What if my laptop shuts down mid-unfollow?</strong></summary>
Progress is saved after EVERY single removal. Run with <code>--resume</code> to continue. Worst case: you lose 1 account.
</details>

<details>
<summary><strong>What's the difference between Cross-Check and Skip Already Unfollowed?</strong></summary>
<strong>Cross-Check</strong> is a standalone feature that checks ALL imported followers live on Instagram — pure verification, no unfollowing. <strong>Skip Already Unfollowed</strong> is a toggle during the unfollow process that skips accounts that already left, tracking them separately in stats.
</details>

<details>
<summary><strong>How does AI analysis work?</strong></summary>
You configure an OpenAI-compatible API endpoint in Settings (e.g., Kintio, OpenAI). The AI analyzes username, bio, follower stats, account age, and other signals to give a bot/fake verdict with confidence score and reasoning.
</details>

<details>
<summary><strong>Can I deploy this to Vercel?</strong></summary>
The web app can be deployed to Vercel, but unfollow scripts and Quick Connect need a real browser (Playwright) and cannot run serverless. Run locally for full functionality.
</details>

<details>
<summary><strong>What happens if Instagram updates their layout?</strong></summary>
The Followers dialog detection uses 6 fallback strategies. If all fail, the script dumps page HTML so selectors can be quickly updated for newer layouts.
</details>

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| ❌ **Can't find browser profile** | Install Brave/Chrome and log into Instagram at least once |
| ❌ **Quick Connect browser opens but nothing happens** | Check if Instagram shows a challenge/block page in the browser window |
| ❌ **Quick Connect closes my tabs** | Save your work first — Playwright needs exclusive browser access |
| ❌ **Can't paste in DevTools Console** | Type `allow pasting` then paste |
| ❌ **Auto-Run not working** | Make sure app is running (`pnpm dev`) |
| ❌ **Port 3000 in use** | `npx kill-port 3000` or `taskkill /F /IM node.exe` |
| ❌ **Playwright error** | Run `npx playwright install chromium` |
| ❌ **4+ accounts not found** | Instagram rate-limited you. Wait a few hours, resume with `--resume` |

---

## 🧪 Tech Stack

| Technology | Purpose |
|-----------|---------|
| [Next.js 16](https://nextjs.org/) (App Router) | Web framework |
| [TypeScript](https://www.typescriptlang.org/) | Language |
| [Tailwind CSS 4](https://tailwindcss.com/) | Styling |
| [Recharts](https://recharts.org/) | Charts & data visualization |
| [Playwright](https://playwright.dev/) | Browser automation (Quick Connect, Unfollow, Cross-Check) |
| [Lucide React](https://lucide.dev/) | Icons |
| [uuid](https://github.com/uuidjs/uuid) | ID generation |

---

<div align="center">
  <strong>Made with ❤️ for a cleaner Instagram experience</strong>
  <br/>
  <sub>Not affiliated with Instagram or Meta Platforms, Inc.</sub>
  <br/><br/>
  <a href="#-instagram-follower-remover">↑ Back to top</a>
</div>
