import { NextRequest } from "next/server"
import { chromium } from "playwright"
import { execSync } from "child_process"
import { existsSync } from "fs"
import { join } from "path"

/* ── POST /api/instagram/auth ──
 * Login to Instagram via Playwright. Two methods:
 *
 * "quick"  — Opens your real Brave/Chrome profile (where you're already logged in),
 *            captures the session cookies, and returns them. Fast & reliable.
 *
 * "manual" — Opens a headed browser to instagram.com/login, fills in your
 *            credentials automatically, then waits for you to complete any
 *            2FA / security challenge in the browser window. Captures cookies
 *            once login succeeds.
 *
 * Body: { method: "quick" | "manual", username?: string, password?: string }
 * Returns: SSE stream
 *   event: log     { text: string }
 *   event: cookies { sessionid, csrftoken, ds_user_id, username, user_id }
 *   event: error   { message: string }
 */

// ── Find browser profile (Brave first, then Chrome) ──
function getBrowserInfo() {
  const username = process.env.USERNAME || "Default"
  const home = `C:\\Users\\${username}`

  // Try Brave first
  const braveDir = `${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\User Data`
  if (existsSync(join(braveDir, "Default"))) {
    return {
      name: "Brave",
      userDataDir: braveDir,
      processName: "brave.exe",
      executablePath: `C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
      altExecutablePath: `${home}\\AppData\\Local\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`,
    }
  }

  // Fallback to Chrome
  const chromeDir = `${home}\\AppData\\Local\\Google\\Chrome\\User Data`
  if (existsSync(join(chromeDir, "Default"))) {
    return { name: "Chrome", userDataDir: chromeDir, processName: "chrome.exe", executablePath: null, altExecutablePath: null }
  }

  return null
}

// ── SSE helpers ──
function send(controller: ReadableStreamDefaultController, type: string, data: any) {
  try {
    const encoder = new TextEncoder()
    controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`))
  } catch {}
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { method, username, password } = body

  if (method !== "quick" && method !== "manual") {
    return new Response(JSON.stringify({ error: "method must be 'quick' or 'manual'" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }

  if (method === "manual" && (!username || !password)) {
    return new Response(JSON.stringify({ error: "username and password required for manual login" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }

  const stream = new ReadableStream({
    start: async (controller) => {
      try {
        // ── 1. Find browser profile ──
        send(controller, "log", { text: "🔍 Looking for browser profile..." })
        const browserInfo = getBrowserInfo()
        if (!browserInfo) {
          send(controller, "error", { message: "Could not find Brave or Chrome profile. Make sure you have Instagram logged in at least once in your browser." })
          try { controller.close() } catch {}
          return
        }
        send(controller, "log", { text: `📁 Found ${browserInfo.name} profile` })

        // ── 2. Kill running browser instances (needed for persistent context) ──
        if (method === "quick") {
          // Only kill for quick method (manual needs browser running for 2FA flow)
          send(controller, "log", { text: `🔌 Closing running ${browserInfo.name} instances...` })
          try {
            execSync(`taskkill /F /IM ${browserInfo.processName}`, { stdio: "pipe", windowsHide: true })
            await new Promise((r) => setTimeout(r, 3000))
          } catch {}
        }

        // ── 3. Launch browser ──
        send(controller, "log", { text: `🚀 Opening ${browserInfo.name} with your profile...` })

        const launchOpts: any = {
          headless: false,
          args: ["--no-sandbox", "--disable-features=ChromeWhatsNewUI"],
          viewport: { width: 1280, height: 800 },
          locale: "en-US",
        }

        if (browserInfo.name === "Chrome") {
          launchOpts.channel = "chrome"
        } else if (browserInfo.executablePath && existsSync(browserInfo.executablePath)) {
          launchOpts.executablePath = browserInfo.executablePath
        } else if (browserInfo.altExecutablePath && existsSync(browserInfo.altExecutablePath)) {
          launchOpts.executablePath = browserInfo.altExecutablePath
        }

        let context
        try {
          context = await chromium.launchPersistentContext(browserInfo.userDataDir, launchOpts)
        } catch (e: any) {
          send(controller, "log", { text: `⚠️ ${e.message}, falling back to bundled Chromium...` })
          delete launchOpts.channel
          delete launchOpts.executablePath
          context = await chromium.launchPersistentContext(browserInfo.userDataDir, launchOpts)
        }

        if (!context) {
          send(controller, "error", { message: "Failed to launch browser." })
          try { controller.close() } catch {}
          return
        }

        const page = await context.newPage()

        // Hide automation signals
        await page.addInitScript(() => {
          Object.defineProperty(navigator, "webdriver", { get: () => undefined })
          ;(window as any).chrome = { runtime: {} }
        })

        // ── 4. Go to Instagram ──
        send(controller, "log", { text: "🌐 Opening Instagram..." })
        try {
          await page.goto("https://www.instagram.com/", { waitUntil: "domcontentloaded", timeout: 30000 })
        } catch {}
        await new Promise((r) => setTimeout(r, 4000))

        // ── 5. Check logged-in status ──
        const isLoggedIn = await checkLoggedIn(page)

        if (method === "quick") {
          if (!isLoggedIn) {
            send(controller, "log", { text: "⚠️ Not logged in. Log in through the browser window — I'll wait..." })
            send(controller, "log", { text: "👀 Waiting for you to log in (up to 5 min)..." })
            const loggedIn = await waitForLogin(page, 300000)
            if (!loggedIn) {
              send(controller, "error", { message: "Login timeout. Please try again." })
              await context.close()
              try { controller.close() } catch {}
              return
            }
            send(controller, "log", { text: "✅ Logged in!" })
          } else {
            send(controller, "log", { text: "✅ Already logged in!" })
          }
        } else {
          // Manual login
          if (isLoggedIn) {
            send(controller, "log", { text: "✅ Already logged in!" })
          } else {
            send(controller, "log", { text: "🔑 Filling in credentials..." })
            await fillCredentials(page, username!, password!)

            send(controller, "log", { text: "👀 Waiting for login..." })
            send(controller, "log", { text: "ℹ️ If you have 2FA enabled, complete it in the browser window." })

            const loggedIn = await waitForLogin(page, 300000)
            if (!loggedIn) {
              send(controller, "error", { message: "Login failed or timed out. Check your credentials and try again." })
              await context.close()
              try { controller.close() } catch {}
              return
            }
            send(controller, "log", { text: "✅ Logged in!" })
          }
        }

        // ── 6. Capture cookies ──
        send(controller, "log", { text: "🍪 Capturing session cookies..." })
        const allCookies = await context.cookies()
        const sessionid = allCookies.find((c: any) => c.name === "sessionid")?.value || ""
        const csrftoken = allCookies.find((c: any) => c.name === "csrftoken")?.value || ""
        const ds_user_id = allCookies.find((c: any) => c.name === "ds_user_id")?.value || ""

        if (!sessionid) {
          send(controller, "error", { message: "Could not get Instagram session cookie. Login may have failed." })
          await context.close()
          try { controller.close() } catch {}
          return
        }

        // Get user info — with a TIMEOUT so it doesn't hang forever
        send(controller, "log", { text: "👤 Getting your profile info..." })
        let myUsername = ""
        let userId = ""

        try {
          const info = await Promise.race([
            page.evaluate(async (appId) => {
              const csrf = (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || ""
              const r = await fetch("https://www.instagram.com/api/v1/users/web_profile_info/", {
                headers: { "x-ig-app-id": appId, "x-csrftoken": csrf },
              })
              const d = await r.json()
              return { username: d.data?.user?.username || "", id: d.data?.user?.id || "" }
            }, "936619743392459"),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
          ]) as any
          myUsername = info.username
          userId = info.id
        } catch {
          send(controller, "log", { text: "⚠️ API call timed out, falling back to URL detection..." })
        }

        // Fallback: extract from URL
        if (!myUsername) {
          const url = page.url()
          const m = url.match(/instagram\.com\/([^\/\?#]+)/)
          if (m && !["accounts", "direct", "explore", "stories"].includes(m[1])) {
            myUsername = m[1]
          }
        }

        // Last resort: use ds_user_id cookie — we don't need username for fetch to work
        if (!userId) userId = ds_user_id

        // ── 7. Close browser ──
        send(controller, "log", { text: "🔒 Closing browser..." })
        await context.close()

        send(controller, "log", { text: `👤 Logged in as @${myUsername}` })
        send(controller, "cookies", {
          sessionid,
          csrftoken,
          ds_user_id,
          username: myUsername,
          user_id: userId,
        })
        send(controller, "done", { message: "Authentication successful!" })

        try { controller.close() } catch {}
      } catch (err: any) {
        send(controller, "error", { message: err.message || "Unknown error" })
        try { controller.close() } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  })
}

// ── Helper: Check if logged in ──
async function checkLoggedIn(page: any): Promise<boolean> {
  try {
    const hasSession = await page.evaluate(() => document.cookie.includes("sessionid="))
    if (hasSession) return true

    const url = page.url()
    if (url.includes("accounts/login") || url.includes("login")) return false

    const navIcons = ['a[href*="/direct/inbox"]', 'a[href*="/explore/"]', 'svg[aria-label="Home"]']
    for (const sel of navIcons) {
      if (await page.$(sel)) return true
    }

    const loginForm = await page.$('input[name="username"]')
    if (loginForm) return false

    const hasCsrf = await page.evaluate(() => document.cookie.includes("csrftoken="))
    return hasCsrf
  } catch {
    return false
  }
}

// ── Helper: Wait for login ──
async function waitForLogin(page: any, timeoutMs: number): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await checkLoggedIn(page)) return true
    await new Promise((r) => setTimeout(r, 2000))
  }
  return false
}

// ── Helper: Fill credentials ──
async function fillCredentials(page: any, username: string, password: string) {
  try {
    // Try going directly to login page
    await page.goto("https://www.instagram.com/accounts/login/", { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 3000))

    // Wait for inputs
    await page.waitForSelector('input[name="username"]', { timeout: 10000 }).catch(() => {})
    await new Promise((r) => setTimeout(r, 500))

    // Clear and fill username
    const userInput = await page.$('input[name="username"]')
    if (userInput) {
      await userInput.click()
      await userInput.fill("")
      await userInput.fill(username)
    }

    await new Promise((r) => setTimeout(r, 300))

    // Clear and fill password
    const passInput = await page.$('input[name="password"]')
    if (passInput) {
      await passInput.click()
      await passInput.fill("")
      await passInput.fill(password)
    }

    await new Promise((r) => setTimeout(r, 500))

    // Click login button
    const loginBtn = await page.$('button[type="submit"]')
    if (loginBtn) {
      await loginBtn.click()
    }
  } catch (e: any) {
    // If anything fails, the browser is open for the user to handle manually
    console.error("Fill credentials error:", e.message)
  }
}
