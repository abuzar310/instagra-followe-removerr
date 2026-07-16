import { NextRequest, NextResponse } from "next/server"

const BASE = "https://i.instagram.com/api/v1"  // <-- i.instagram.com, not www
const WEB_BASE = "https://www.instagram.com"
const APP_ID = "936619743392459"

interface ProxyRequest {
  cookies: { sessionid: string; csrftoken: string; ds_user_id: string; rur?: string }
  endpoint: string
  method: "GET" | "POST"
  params?: Record<string, string | number>
}

export async function POST(request: NextRequest) {
  try {
    const body: ProxyRequest = await request.json()
    if (!body.cookies?.sessionid) {
      return NextResponse.json({ error: "Missing sessionid" }, { status: 400 })
    }

    const cookieStr = [
      `sessionid=${body.cookies.sessionid}`,
      `csrftoken=${body.cookies.csrftoken}`,
      `ds_user_id=${body.cookies.ds_user_id}`,
      body.cookies.rur ? `rur=${body.cookies.rur}` : '',
    ].filter(Boolean).join('; ')

    // Try i.instagram.com first, then fallback to www
    for (const base of [BASE, WEB_BASE + '/api/v1']) {
      try {
        let url = `${base}${body.endpoint}`
        if (body.method === "GET" && body.params) {
          const sp = new URLSearchParams()
          Object.entries(body.params).forEach(([k, v]) => sp.set(k, String(v)))
          url += `?${sp.toString()}`
        }

        const res = await fetch(url, {
          method: body.method,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            Accept: "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "x-csrftoken": body.cookies.csrftoken,
            "x-ig-app-id": APP_ID,
            "x-requested-with": "XMLHttpRequest",
            Origin: "https://www.instagram.com",
            Referer: "https://www.instagram.com/",
            "Sec-Fetch-Site": "same-site",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            Cookie: cookieStr,
          },
          ...(body.method === "POST" ? { body: "{}" } : {}),
        })

        const text = await res.text()

        // If HTML returned, skip this base
        if (text.trim().startsWith("<")) continue

        let data: unknown
        try { data = JSON.parse(text) } catch { continue }

        const obj = data as Record<string, unknown>
        if (obj.message === "login_required" || obj.status === "fail") {
          continue  // Try next base
        }

        return NextResponse.json({ status: res.status, ok: res.ok, data })
      } catch { continue }
    }

    return NextResponse.json({ error: "Instagram blocked the request - your cookies may be expired. Try going to instagram.com, refreshing the page, then copying fresh cookies from Cookie-Editor." }, { status: 403 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 })
  }
}
