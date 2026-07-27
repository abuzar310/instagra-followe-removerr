import { NextRequest } from "next/server"

/* ── POST /api/ai/analyze ──
 * Analyzes an Instagram profile using Kintio AI (OpenAI-compatible API)
 * and returns a bot/real verdict.
 *
 * Body: { profile: { username, full_name, biography, followers_count, ... } }
 * Returns: JSON { verdict, confidence, reasoning }
 */

export async function POST(req: NextRequest) {
  try {
    const { profile, apiKey, apiUrl, model } = await req.json()

    if (!profile?.username) {
      return new Response(JSON.stringify({ error: "Profile data required" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })
    }

    const endpoint = apiUrl || process.env.KINTIO_API_URL || "https://api.kintio.com"
    const key = apiKey || process.env.KINTIO_API_KEY || ""
    const aiModel = model || process.env.KINTIO_MODEL || "gpt-4o-mini"

    if (!key) {
      return new Response(JSON.stringify({ error: "API key not configured" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })
    }

    const p = profile
    const bioPreview = (p.biography || "").slice(0, 200)

    const systemPrompt = `You are an Instagram account analyzer. Given profile data, determine if the account is a real person or a bot/fake account. Be critical and strict — most purchased followers are obvious fakes.

Respond ONLY with a JSON object:
{
  "verdict": "real" | "bot" | "suspicious",
  "confidence": 0-100,
  "reasoning": "Brief 1-2 sentence explanation focusing on the strongest signals"
}`

    const userPrompt = `Analyze this Instagram profile:

Username: @${p.username}
Full name: "${p.full_name || "(empty)"}"
Bio: "${bioPreview || "(empty)"}"
Followers: ${p.followers_count ?? "?"}
Following: ${p.following_count ?? "?"}
Posts: ${p.posts_count ?? "?"}
Has profile picture: ${p.has_profile_pic ? "Yes (custom photo)" : "No (default avatar)"}
Private: ${p.is_private ? "Yes" : "No"}
Verified: ${p.is_verified ? "Yes" : "No"}
Business: ${p.is_business ? "Yes" : "No"}
Account age: ${p.account_age_days ?? "?"} days
Has external URL: ${p.external_url ? "Yes" : "No"}`

    const response = await fetch(`${endpoint.replace(/\/+$/, "")}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 300,
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error")
      return new Response(JSON.stringify({
        error: `API error (${response.status}): ${errText.slice(0, 200)}`,
      }), {
        status: 502,
        headers: { "content-type": "application/json" },
      })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ""

    // Parse JSON from response
    let result
    try {
      // Find JSON in the response (handle markdown wrapping)
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : { verdict: "unknown", confidence: 0, reasoning: "Could not parse AI response" }
    } catch {
      result = { verdict: "unknown", confidence: 0, reasoning: "Could not parse AI response" }
    }

    return new Response(JSON.stringify({
      verdict: result.verdict || "unknown",
      confidence: Math.min(100, Math.max(0, result.confidence || 0)),
      reasoning: result.reasoning || "",
    }), {
      headers: { "content-type": "application/json" },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({
      error: err.message || "Unknown error",
    }), {
      status: 500,
      headers: { "content-type": "application/json" },
    })
  }
}
