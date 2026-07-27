<div align="center">

# 📸 Instagram Follower Review & Remover

**Fetch → Analyze → Review → Remove — All from your local machine.**

[![Next.js](https://img.shields.io/badge/Next.js_16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Playwright](https://img.shields.io/badge/Playwright_1.61-45ba4b?logo=playwright&logoColor=white)](https://playwright.dev/)
[![Recharts](https://img.shields.io/badge/Recharts-22c55e?logo=react&logoColor=white)](https://recharts.org/)
[![pnpm](https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=white)](https://pnpm.io/)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**No third-party services · No API keys · Your data stays on your machine**

</div>

---

## ✨ Features at a Glance

<div>
<table>
<tr>
<td width="50%" valign="top">

### 🔌 3 Ways to Connect
| Method | How |
|--------|-----|
| **⚡ Quick Connect** | One click — browser pops up, session captured, auto-fetches |
| **🔑 Manual Login** | Type credentials in the app, auto-fills, handles 2FA |
| **📟 DevTools Script** | Copy script → paste in console → paste data back |

</td>
<td width="50%" valign="top">

### 🚀 Unfollow
| Mode | How |
|------|-----|
| **▶️ Auto-Run** | In-app with live progress bar, stats, logs, stop button |
| **💻 Manual (CLI)** | Terminal script with `--resume`, `--furious`, `-u`, `-n` |
| **🎯 Start From** | First account, specific username, or account number |

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 📊 Dashboard & Review
- Score distribution chart
- Import history with timestamps
- 50 profiles/page with pagination
- Search by username, sort by score/followers/following
- Filter by reviewed/approved/private/verified
- Bulk approve / reject / delete
- **Keyboard shortcuts:** `J`/`K` pages · `S` search · `A` approve · `R` reject
- Export CSV or JSON (all or approved only)

</td>
<td width="50%" valign="top">

### ⚙️ Smart Scoring
- **12 rule fields** — followers, following, posts, profile pic, private, verified, business, username, bio, ratio, digit count, account age
- **Customizable points** (1–50 slider per rule)
- **Enable/disable** individual rules
- **Whitelist** — rejected accounts stay rejected forever
- **Backup & Restore** — export all data as JSON

</td>
</tr>
</table>
</div>

---

## 🚀 Quick Start

### Prerequisites

| Requirement | Details |
|-------------|---------|
| **Node.js** | 18+ |
| **Package manager** | pnpm (recommended) or npm |
| **Browser** | Brave or Chrome (with Instagram logged in for Quick Connect) |
| **Playwright browsers** | Run `npx playwright install chromium` |

### Installation

```bash
# Clone the repo
git clone https://github.com/abuzar310/instagra-followe-removerr.git
cd insta-follower-review

# Install dependencies
pnpm install

# Install Playwright browser for login + unfollow features
npx playwright install chromium

# Start the app
pnpm dev
```

Open **[http://localhost:3000](http://localhost:3000)** 🚀

---

## 📖 Workflow Guide

### Step 1: Connect Instagram

Choose your favorite method on the **Connect** page:

<details>
<summary><strong>⚡ Method A: Quick Connect</strong> (Fastest — 1 Click)</summary>

> ✅ You must be logged into Instagram in your Brave or Chrome browser.

1. Go to the **Connect** page → **Quick Connect** tab
2. Click **"Quick Connect"**
3. A browser window briefly opens and closes (captures your session)
4. Your followers & following **load automatically**
5. Done! Head to the **Review** page

*Behind the scenes: Playwright opens your real browser profile, captures session cookies, then uses Instagram's API to fetch your data. No scripts, no copy-paste.*

</details>

<details>
<summary><strong>🔑 Method B: Manual Login</strong> (Credentials)</summary>

1. Go to the **Connect** page → **Manual Login** tab
2. Type your **Instagram username** and **password**
3. Click **"Login & Fetch"**
4. A browser opens — credentials are filled automatically
5. If you have **2FA**, complete it in the browser window
6. Data loads automatically after login

*🔒 Your credentials stay on YOUR machine — typed directly into Instagram's login page, never sent to any server.*

</details>

<details>
<summary><strong>📟 Method C: DevTools Script</strong> (Fallback)</summary>

1. **Connect** page → **DevTools Script** tab → **Copy Script**
2. Open `instagram.com` in your browser (logged in)
3. Press **F12** → **Console** tab → paste script → Enter
4. Wait for **"📋 COPIED!"** message
5. Come back → **Paste** tab → paste → **Import & Analyze**

*Troubleshooting: Can't paste? Type `allow pasting` first. Nothing copied? Right-click the console output and copy manually.*

</details>

> 💡 **Alternative:** Run `node scripts/fetch-instagram.mjs` from terminal to fetch via browser scrolling. Then upload the saved file on the **Import** page.

---

### Step 2: Review Accounts

1. Go to the **Review** page
2. Profiles scored **30+** are flagged 🟡 yellow, **60+** 🔴 high risk
3. Click a profile to see detailed info + **suspicion reasons**
4. **Approve** (✅ will be unfollowed) or **Reject** (❌ kept forever, whitelisted)
5. Use keyboard shortcuts for speed:

```
A = Approve      R = Reject      J = Previous page
K = Next page    S = Focus search    Esc = Close preview
```

---

### Step 3: Customize Scoring Rules

Go to the **Rules** page to adjust how profiles are scored:

| Rule | Points | What It Checks |
|------|:------:|----------------|
| Zero posts | **30** | Account has 0 posts |
| Few followers (<20) | **25** | Has fewer than 20 followers |
| High following (>2000) | **20** | Follows more than 2000 accounts |
| Following >> followers | **25** | Follower/following ratio < 0.1 |
| No profile pic | **20** | No profile picture |
| Many digits in username | **15** | Username has 5+ digits (bot pattern) |
| Private account | **10** | Account is private |
| Not verified | **5** | Account is not verified |

---

### Step 4: Unfollow

After reviewing, you have **two ways** to unfollow:

#### ▶️ Auto-Run (In-App)

1. Go to **Review** page → click **"Start Unfollow"** → **Auto-Run** tab
2. **🎯 Start From:**
   - **First account** — starts from the beginning
   - **From username** — continues from a specific account
   - **From account #** — jumps to a specific position
3. Toggle **🔥 Furious Mode** if you want faster pace
4. Click **"Start Auto-Run"**
5. Watch live progress — real-time stats, progress bar, and logs
6. **Auto-stops** if Instagram blocks you (4+ consecutive errors)
7. Click **Stop** anytime — progress saved, resume later

#### 💻 Manual (Terminal)

```bash
# Start fresh
node scripts/unfollow-brave.mjs to-unfollow.json

# Resume from where you left off
node scripts/unfollow-brave.mjs to-unfollow.json --resume

# Start from a specific username
node scripts/unfollow-brave.mjs to-unfollow.json -u someusername

# Start from a specific account number (1-based)
node scripts/unfollow-brave.mjs to-unfollow.json -n 50

# Furious mode (faster pace)
node scripts/unfollow-brave.mjs to-unfollow.json -f
```

**The script:**
- Opens your browser (logged in) → goes to profile → clicks Followers
- Searches each username → clicks Remove → confirms
- **Saves progress after EVERY removal**
- **Auto-block detection** — stops if Instagram rate-limits you
- Press **Ctrl+C** anytime to stop safely
- Resume with `--resume`

---

## 📊 Suspicion Scoring

| Score Range | Color | Meaning |
|:-----------:|:-----:|---------|
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
│   │   ├── page.tsx                     # 📊 Dashboard
│   │   ├── review/page.tsx              # 🔍 Review Queue + Unfollow Dialog
│   │   ├── import/page.tsx              # 📥 Import / Backup Restore
│   │   ├── rules/page.tsx               # ⚙️ Suspicion Rules
│   │   ├── whitelist/page.tsx           # 🛡️ Whitelist
│   │   ├── connect/page.tsx             # 🔌 Connect Instagram (3 methods)
│   │   ├── layout.tsx                   # 🧩 App layout + sidebar
│   │   ├── globals.css                  # 🎨 Tailwind styles
│   │   └── api/
│   │       ├── instagram/
│   │       │   ├── auth/route.ts        # 🔐 Quick Connect + Manual Login
│   │       │   ├── fetch/route.ts       # 📡 Fetch followers via Instagram API
│   │       │   ├── proxy/route.ts       # 🔗 Proxy route for API calls
│   │       │   └── browser/             # Legacy browser routes
│   │       └── unfollow/
│   │           ├── run/route.ts         # ▶️ Auto-run unfollow (SSE)
│   │           └── stop/route.ts        # ⏹ Stop unfollow process
│   ├── components/
│   │   ├── Sidebar.tsx                  # 🧭 Navigation
│   │   └── Avatar.tsx                   # 👤 Profile avatar
│   ├── hooks/
│   │   ├── useData.ts                   # 📦 Data hook
│   │   └── useUnfollowStream.ts         # 🔄 SSE hook for auto-run
│   └── lib/
│       ├── store.ts                     # 💾 LocalStorage + scoring engine
│       ├── types.ts                     # 📐 TypeScript types
│       ├── utils.ts                     # 🔧 Shared utilities
│       └── ig-scraper-script.ts         # 📜 DevTools script generator
├── scripts/
│   ├── unfollow-brave.mjs               # 🏆 Main unfollow script
│   ├── unfollow-ui.mjs                  # UI-based unfollow (alt)
│   ├── unfollow-instagram.mjs           # API-based unfollow (legacy)
│   └── fetch-instagram.mjs              # Fetch followers via browser
├── package.json
├── next.config.ts
└── tsconfig.json
```

---

## 🧰 Scripts Reference

### `unfollow-brave.mjs` 🏆 Primary

```bash
node scripts/unfollow-brave.mjs <file>              # Start fresh
node scripts/unfollow-brave.mjs <file> --resume      # Resume
node scripts/unfollow-brave.mjs <file> -u <user>     # From username
node scripts/unfollow-brave.mjs <file> -n <number>   # From account #
node scripts/unfollow-brave.mjs <file> -f            # Furious mode
```

| Feature | Description |
|---------|-------------|
| ✅ Browser profile | Uses your real Brave/Chrome login |
| ✅ Safe search | Verifies username before clicking Remove |
| ✅ Auto-block detect | Stops after 4 consecutive "not found" errors |
| ✅ Progress save | Saved after EVERY single removal |
| ✅ Furious mode | `-f` for faster pace (higher risk) |
| ✅ Resume | `--resume` to continue from last position |
| ✅ Start position | `-u <username>` or `-n <number>` |

### `fetch-instagram.mjs`

```bash
node scripts/fetch-instagram.mjs
```

Fetches followers/following via browser UI scrolling (no API rate limits). Output: `scripts/instagram-data.json`.

---

## 💾 Data Persistence

### App Data (Browser localStorage)

| Key | Stores |
|-----|--------|
| `ifr_followers` | All imported profiles with scores & review status |
| `ifr_rules` | Suspicion rules configuration |
| `ifr_batches` | Import history |
| `ifr_whitelist` | Kept accounts |

**Backup:** Dashboard → **Backup** → downloads `.json` → **Import** → **Restore Backup**

### Unfollow Script Progress

| File | Contents |
|------|----------|
| `scripts/.brave-unfollow-progress.json` | Current progress (removed, skipped, errors) |
| `scripts/brave-removal-results.json` | Final results after completion |

---

## ❓ FAQ

<details>
<summary><strong>Will Instagram ban me?</strong></summary>
No. The scripts simulate human behavior — ~75 removals/hour with random delays. The Quick Connect uses your real browser profile (same as logging in normally). This is well within normal usage patterns.
</details>

<details>
<summary><strong>What if my laptop shuts down?</strong></summary>
The script saves progress <strong>after every single removal</strong>. Run <code>--resume</code> to continue from the last saved position. Worst case: you lose 1 account.
</details>

<details>
<summary><strong>Is the Quick Connect browser popup safe?</strong></summary>
Yes. Playwright opens your real browser with your profile. Credentials are typed directly into Instagram's login page on YOUR machine. The browser closes automatically after capturing the session.
</details>

<details>
<summary><strong>Can I deploy this to Vercel?</strong></summary>
The web app can be deployed to Vercel, but the unfollow scripts and Quick Connect need a real browser (Playwright) and cannot run serverless. Run locally for full functionality.
</details>

<details>
<summary><strong>Data lost after closing the app?</strong></summary>
It's in your browser's localStorage — reopening localhost:3000 should restore it. If cleared, use Dashboard → Backup → Restore if you have a backup file.
</details>

<details>
<summary><strong>Unfollow script can't find the Followers button?</strong></summary>
It tries 6 strategies to find and click the Followers button. If all fail, it dumps page HTML so the selector can be updated for newer Instagram layouts.
</details>

---

## 🔧 Troubleshooting

| Issue | Solution |
|-------|----------|
| ❌ **Can't find browser profile** | Install Brave/Chrome and log into Instagram at least once |
| ❌ **Quick Connect closes tabs** | Save your work first — Playwright needs exclusive browser access |
| ❌ **Can't paste in DevTools** | Type `allow pasting` in the console first |
| ❌ **Auto-Run not working** | Make sure app is running (`pnpm dev`) and scripts/ exists |
| ❌ **Port 3000 in use** | `npx kill-port 3000` or `netstat -ano \| findstr :3000` + `taskkill /PID <PID> /F` |
| ❌ **Playwright error** | Run `npx playwright install chromium` |

---

## 🧪 Tech Stack

| Technology | Purpose |
|-----------|---------|
| [Next.js 16](https://nextjs.org/) (App Router) | Web framework |
| TypeScript | Language |
| [Tailwind CSS 4](https://tailwindcss.com/) | Styling |
| [Recharts](https://recharts.org/) | Charts & data visualization |
| [PapaParse](https://www.papaparse.com/) | CSV parsing |
| [Playwright](https://playwright.dev/) | Browser automation |
| [Lucide React](https://lucide.dev/) | Icons |
| [uuid](https://github.com/uuidjs/uuid) | ID generation |

---

## 📄 License

MIT — use it, modify it, share it.

---

<div align="center">
  <strong>Made with ❤️ for a cleaner Instagram experience</strong>
  <br/>
  <sub>Not affiliated with Instagram or Meta</sub>
</div>
