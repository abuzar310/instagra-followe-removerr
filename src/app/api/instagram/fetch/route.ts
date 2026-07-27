import { NextRequest } from "next/server"

/* ── POST /api/instagram/fetch ──
 * Uses Instagram session cookies to fetch followers & following via Instagram's
 * internal API. Paginates automatically with delays to avoid rate limits.
 *
 * Body: { cookies: { sessionid, csrftoken, ds_user_id } }
 * Returns: SSE stream
 *   event: log       { text: string }
 *   event: progress  { phase: "followers"|"following", count: number, total?: number }
 *   event: done      { followers: any[], following: any[], followersCount: number, followingCount: number }
 *   event: error     { message: string }
 */

const APP_ID = "936619743392459"

function send(controller: ReadableStreamDefaultController, type: string, data: any) {
  try {
    const encoder = new TextEncoder()
    controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`))
  } catch {}
}

// ── Instagram API fetch with retry ──
async function igFetch(url: string, cookies: any, retries = 5): Promise<any> {
  const cookieStr = [
    `sessionid=${cookies.sessionid}`,
    `csrftoken=${cookies.csrftoken}`,
    `ds_user_id=${cookies.ds_user_id}`,
  ].join("; ")

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0",
          Accept: "*/*",
          "Accept-Language": "en-US,en;q=0.9",
          "x-csrftoken": cookies.csrftoken,
          "x-ig-app-id": APP_ID,
          "x-requested-with": "XMLHttpRequest",
          Origin: "https://www.instagram.com",
          Referer: "https://www.instagram.com/",
          Cookie: cookieStr,
        },
      })

      const text = await res.text()

      // If HTML returned, cookies might be expired
      if (text.trim().startsWith("<")) {
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, 5000))
          continue
        }
        return null
      }

      const data = JSON.parse(text)

      if (data.message === "login_required" || data.status === "fail") {
        if (attempt < retries) {
          const wait = Math.min(30000 * Math.pow(2, attempt), 120000)
          await new Promise((r) => setTimeout(r, wait))
          continue
        }
        return null
      }

      return data
    } catch (err) {
      if (attempt >= retries) return null
      await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)))
    }
  }
  return null
}

// ── Paginate one endpoint ──
async function fetchList(cookies: any, userId: string, kind: "followers" | "following", controller: ReadableStreamDefaultController): Promise<any[]> {
  const items: any[] = []
  let nextMaxId: string | null = null
  const MAX_PAGES = 50
  const PAGE_SIZE = 200

  for (let i = 0; i < MAX_PAGES; i++) {
    let url = `https://i.instagram.com/api/v1/friendships/${userId}/${kind}/?count=${PAGE_SIZE}`
    if (nextMaxId) url += `&max_id=${encodeURIComponent(nextMaxId)}`

    const data = await igFetch(url, cookies)
    if (!data) break

    const users = data.users || []
    items.push(...users)

    send(controller, "progress", { phase: kind, count: items.length })
    send(controller, "log", { text: `📥 ${items.length} ${kind} fetched...` })

    nextMaxId = data.next_max_id || null
    if (!nextMaxId) break

    // Delay between pages: 3-10 seconds
    const delay = 3000 + Math.random() * 7000
    await new Promise((r) => setTimeout(r, delay))
  }

  return items
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { cookies } = body

  if (!cookies?.sessionid) {
    return new Response(JSON.stringify({ error: "Missing sessionid cookie" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    })
  }

  const stream = new ReadableStream({
    start: async (controller) => {
      try {
        // ── 1. Get user info ──
        send(controller, "log", { text: "🔍 Getting user info..." })

        const infoUrl = "https://www.instagram.com/api/v1/users/web_profile_info/"
        const infoData = await igFetch(infoUrl, cookies)
        let userId = cookies.ds_user_id || ""
        let myUsername = ""

        if (infoData?.data?.user) {
          userId = infoData.data.user.id || userId
          myUsername = infoData.data.user.username || ""
          send(controller, "log", { text: `👤 @${myUsername} (ID: ${userId})` })
        } else {
          send(controller, "log", { text: `⚠️ Using user ID from cookie: ${userId}` })
        }

        if (!userId) {
          send(controller, "error", { message: "Could not determine user ID." })
          try { controller.close() } catch {}
          return
        }

        // ── 2. Fetch followers ──
        send(controller, "log", { text: "📡 Fetching followers..." })
        const followers = await fetchList(cookies, userId, "followers", controller)
        send(controller, "log", { text: `✅ ${followers.length} followers fetched` })

        // ── 3. Fetch following ──
        send(controller, "log", { text: "📡 Fetching following..." })
        const following = await fetchList(cookies, userId, "following", controller)
        send(controller, "log", { text: `✅ ${following.length} following fetched` })

        // ── 4. Done ──
        send(controller, "done", {
          followers,
          following,
          followersCount: followers.length,
          followingCount: following.length,
          username: myUsername,
          userId,
          fetchedAt: new Date().toISOString(),
        })

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
