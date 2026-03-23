export async function onRequestPost(context) {
  const { request, env } = context;

  // ── CORS headers ────────────────────────────────────────────────────────────
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await request.json();
    const { prompt, model } = body;

    // ── Input validation ─────────────────────────────────────────────────────
    if (!prompt || typeof prompt !== "string") {
      return json({ error: "Missing prompt" }, 400, corsHeaders);
    }
    if (prompt.length > 300) {
      return json({ error: "Prompt must be under 300 characters" }, 400, corsHeaders);
    }
    if (!["claude", "openai"].includes(model)) {
      return json({ error: "Invalid model" }, 400, corsHeaders);
    }

    // ── Cache check (FIXED: uses hashed key, not raw prompt in URL) ──────────
    const cache = caches.default;
    const cacheKey = new Request(
      `https://roadmap-cache.internal/${model}/${await hashString(prompt)}`
    );
    const cached = await cache.match(cacheKey);
    if (cached) {
      const cachedData = await cached.json();
      return json(cachedData, 200, { ...corsHeaders, "X-Cache": "HIT" });
    }

    // ── System prompt (structured JSON roadmap) ──────────────────────────────
    const systemPrompt = `You are an expert learning coach and curriculum designer.
When given a topic or goal, return a structured learning roadmap as a JSON object.

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation, no code fences.

The JSON must follow this exact structure:
{
  "title": "string — short roadmap title",
  "phases": [
    {
      "title": "string — phase name",
      "duration": "string — e.g. 'Week 1-2' or 'Month 1'",
      "description": "string — 1-2 sentence overview of this phase",
      "tasks": ["string", "string", "string"],
      "milestone": "string — what the learner can do/show at end of this phase"
    }
  ]
}

Rules:
- Always produce 3-5 phases
- Each phase has 3-6 concrete, actionable tasks
- Tasks are specific, not vague (say "Build a CRUD REST API with Express" not "learn backend")
- Duration should be realistic for a motivated beginner-to-intermediate learner
- Milestones should be demonstrable achievements`;

    // ── Build request per model ──────────────────────────────────────────────
    let url, headers, reqBody;

    if (model === "claude") {
      url = "https://api.anthropic.com/v1/messages";
      headers = {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      };
      reqBody = {
        model: "claude-sonnet-4-20250514", // FIXED: was claude-3-sonnet-20240229
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: `Create a roadmap for: ${prompt}` }],
      };
    } else {
      url = "https://api.openai.com/v1/chat/completions";
      headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.OPENAI_API_KEY}`,
      };
      reqBody = {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Create a roadmap for: ${prompt}` },
        ],
        response_format: { type: "json_object" },
      };
    }

    // ── Fetch with retry + exponential backoff ───────────────────────────────
    const apiRes = await retryFetch(url, headers, reqBody);
    const data = await apiRes.json();

    if (!apiRes.ok) {
      const errMsg = data?.error?.message || `API error ${apiRes.status}`;
      return json({ error: errMsg }, 502, corsHeaders);
    }

    // ── Cache successful response for 1 hour ─────────────────────────────────
    const response = new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        ...corsHeaders,
      },
    });

    context.waitUntil(cache.put(cacheKey, response.clone()));

    return response;

  } catch (err) {
    console.error("generate error:", err);
    return json({ error: "Internal server error" }, 500, corsHeaders);
  }
}

// ── Retry with exponential backoff ────────────────────────────────────────────
async function retryFetch(url, headers, body, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (res.status !== 429) return res;
    const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
    await new Promise(r => setTimeout(r, delay));
  }
  throw new Error("Rate limit exceeded after retries");
}

// ── Hash prompt for safe cache key (FIXED: prevents cache poisoning) ──────────
async function hashString(str) {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

// ── JSON response helper ──────────────────────────────────────────────────────
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}