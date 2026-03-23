var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// functions/generate.js
var generate_default = {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};
async function handleRequest(request, env, context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = await request.json();
    const { prompt, model } = body;
    if (!prompt || typeof prompt !== "string") {
      return json({ error: "Missing prompt" }, 400, corsHeaders);
    }
    if (prompt.length > 300) {
      return json({ error: "Prompt must be under 300 characters" }, 400, corsHeaders);
    }
    if (model !== "nvidia") {
      return json({ error: "Only nvidia model is supported" }, 400, corsHeaders);
    }
    const cache = caches.default;
    const cacheKey = new Request(
      `https://roadmap-cache.internal/${model}/${await hashString(prompt)}`
    );
    const cached = await cache.match(cacheKey);
    if (cached) {
      const cachedData = await cached.json();
      return json(cachedData, 200, { ...corsHeaders, "X-Cache": "HIT" });
    }
    const systemPrompt = `You are an expert learning coach and curriculum designer.
When given a topic or goal, return a structured learning roadmap as a JSON object.

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation, no code fences.

The JSON must follow this exact structure:
{
  "title": "string \u2014 short roadmap title",
  "phases": [
    {
      "title": "string \u2014 phase name",
      "duration": "string \u2014 e.g. 'Week 1-2' or 'Month 1'",
      "description": "string \u2014 1-2 sentence overview of this phase",
      "tasks": ["string", "string", "string"],
      "milestone": "string \u2014 what the learner can do/show at end of this phase"
    }
  ]
}

Rules:
- Always produce 3-5 phases
- Each phase has 3-6 concrete, actionable tasks
- Tasks are specific, not vague (say "Build a CRUD REST API with Express" not "learn backend")
- Duration should be realistic for a motivated beginner-to-intermediate learner
- Milestones should be demonstrable achievements`;
    const url = "https://integrate.api.nvidia.com/v1/chat/completions";
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.NVIDIA_API_KEY}`
    };
    const reqBody = {
      model: "meta/llama-3.1-405b-instruct",
      max_tokens: 2e3,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Create a roadmap for: ${prompt}` }
      ]
    };
    const apiRes = await retryFetch(url, headers, reqBody);
    const data = await apiRes.json();
    if (!apiRes.ok) {
      const errMsg = data?.error?.message || `API error ${apiRes.status}`;
      return json({ error: errMsg }, 502, corsHeaders);
    }
    const response = new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=3600",
        ...corsHeaders
      }
    });
    context.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (err) {
    console.error("generate error:", err);
    return json({ error: "Internal server error" }, 500, corsHeaders);
  }
}
__name(handleRequest, "handleRequest");
async function retryFetch(url, headers, body, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    });
    if (res.status !== 429) return res;
    const delay = Math.pow(2, i) * 1e3;
    await new Promise((r) => setTimeout(r, delay));
  }
  throw new Error("Rate limit exceeded after retries");
}
__name(retryFetch, "retryFetch");
async function hashString(str) {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(hashString, "hashString");
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders }
  });
}
__name(json, "json");
export {
  generate_default as default
};
//# sourceMappingURL=generate.js.map
