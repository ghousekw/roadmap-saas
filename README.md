# Pathfinder — AI Roadmap Generator

## Project Structure

```
roadmap-saas/
├── public/
│   ├── index.html          # Frontend UI
│   └── app.js              # Frontend logic
├── functions/
│   ├── generate.js         # AI generation Worker
│   └── r/[id].js           # Public share Worker
├── supabase-setup.sql      # Run this in Supabase SQL editor
└── wrangler.toml           # Cloudflare config
```

## Setup

### 1. Supabase
1. Create a project at https://supabase.com
2. Go to SQL Editor → paste and run `supabase-setup.sql`
3. Go to Authentication → Providers → enable Email (OTP)
4. Copy your Project URL and anon key

### 2. Configure frontend
In `public/app.js`, replace:
```js
"YOUR_SUPABASE_URL"      → your Supabase project URL
"YOUR_SUPABASE_ANON_KEY" → your Supabase anon key
```

### 3. Deploy to Cloudflare Pages
1. Push this repo to GitHub
2. Go to https://pages.cloudflare.com → Create a project
3. Connect your GitHub repo
4. Build settings:
   - Build command: (leave blank)
   - Build output directory: `public`
5. Add environment variables:
   ```
   ANTHROPIC_API_KEY = sk-ant-...
   OPENAI_API_KEY    = sk-...
   SUPABASE_URL      = https://xxxx.supabase.co
   SUPABASE_KEY      = your-service-role-key
   ```
6. Deploy!

## Bugs Fixed vs Original

| Bug | Original | Fixed |
|-----|----------|-------|
| Supabase init | `supabase.createClient(...)` (broken) | `const { createClient } = supabase` |
| Claude model | `claude-3-sonnet-20240229` (deprecated) | `claude-sonnet-4-20250514` |
| Cache key | Raw prompt in URL (cache poisoning risk) | SHA-256 hashed prompt |
| No system prompt | Raw user input sent to AI | Structured JSON roadmap prompt |
| PDF overflow | Single `doc.text()` call (clipped) | Multi-page with `splitTextToSize` |
| No input validation | Any input length accepted | Max 300 chars, type checks |
| No RLS | All data readable/writable by anyone | Full RLS policies on all tables |
| Retry backoff | Fixed 1.5s delay | Exponential: 1s → 2s → 4s |
| No CORS headers | Missing on Worker responses | Added to all responses |
| No error handling | Silent failures in UI | Error bar + toast notifications |

## Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `ANTHROPIC_API_KEY` | Cloudflare Pages | Your Claude API key |
| `OPENAI_API_KEY` | Cloudflare Pages | Your OpenAI API key |
| `SUPABASE_URL` | Cloudflare Pages | Your Supabase project URL |
| `SUPABASE_KEY` | Cloudflare Pages | Supabase service role key (for Worker) |