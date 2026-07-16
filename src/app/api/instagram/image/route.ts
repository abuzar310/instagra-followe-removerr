import { NextRequest, NextResponse } from "next/server"

/* ── GET /api/instagram/image?url=... ──
 * Proxies Instagram CDN profile pictures. IG's CDN blocks cross-origin
 * hotlinking (referrer checks), so <img src> pointing at it directly fails —
 * fetching server-side works fine.
 */

const ALLOWED_HOSTS = [
  ".cdninstagram.com",
  ".fbcdn.net",
  ".instagram.com",
]

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url")
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }

  // Only proxy Instagram/Facebook CDN hosts — don't be an open proxy
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.some((h) => parsed.hostname.endsWith(h))) {
    return NextResponse.json({ error: "Host not allowed" }, { status: 403 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Referer: "https://www.instagram.com/",
      },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Upstream ${res.status}` }, { status: res.status })
    }

    const buf = await res.arrayBuffer()
    return new NextResponse(buf, {
      headers: {
        "Content-Type": res.headers.get("content-type") || "image/jpeg",
        // CDN URLs are immutable-ish; cache aggressively in the browser
        "Cache-Control": "public, max-age=86400, immutable",
      },
    })
  } catch {
    return NextResponse.json({ error: "Fetch failed" }, { status: 502 })
  }
}
