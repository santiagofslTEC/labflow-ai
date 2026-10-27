# 0001. Stack and architecture for LabFlow AI

**Date**: 2026-10-27
**Status**: Accepted

## Summary

LabFlow is two small apps in one repo: a Next.js web app (the screens, installable on phones and laptops) and a Python FastAPI service (the data, the AI calls, and every secret key). Data lives in Supabase Postgres. An open model on Ollama's hosted cloud reads each sentence, and Claude takes over automatically when Ollama fails or is slow. ElevenLabs turns speech into text. Only people you give a personal access code can open it, which keeps the demo private and your AI credits safe.

## Decision

**Chosen option**: Option 1: Next.js web app plus FastAPI service, Supabase Postgres, Ollama Cloud with Claude fallback.

Build a two part monolith (one web app and one API service, no microservices) in a single repo, deployed to Vercel (web) and Railway (API), where the API is the only place that talks to the database, the LLMs, and ElevenLabs.

**Implementation skills**: `fastapi` (`fastapi/fastapi`, `.claude/skills/fastapi/`) · `sqlmodel` (`fastapi/sqlmodel`, `.claude/skills/sqlmodel/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.claude/skills/supabase-postgres-best-practices/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `speech-to-text` (`elevenlabs/skills`, `.claude/skills/speech-to-text/`) · `use-railway` (`railwayapp/railway-skills`, `.claude/skills/use-railway/`)

## Proposed stack

| Layer | Choice | Reason |
|---|---|---|
| Architecture | Two deployables: `web/` (Next.js) and `api/` (FastAPI), one repo | One API holds all keys and rules; two apps match the two languages, nothing more. |
| Repo layout | Single repo: `web/`, `api/`, `docs/` at the root | Specs, scope, and both sides of each endpoint change in one PR. |
| Front end language | TypeScript (strict) | Typed UI; types for API calls are generated from the backend. |
| Front end framework | Next.js, current stable major, App Router | Chosen by the team; first class on Vercel, and its rewrites give one origin for UI and API. |
| Rendering | Client components for the workspace (P3); server components only for static shells | Mic, proposal card, table, and chart are interactive; no SEO need. |
| Installability | PWA: `app/manifest.ts` plus icons; no offline caching in the MVP | Installs on phone and laptop home screens; offline makes no sense when every step needs the API. |
| Styling | Tailwind CSS | Chosen now; the component library is decided in feature 4 (design system). |
| Charts | Plotly via `react-plotly.js`, loaded with `next/dynamic` and `ssr: false` | Chosen by the team; zoom and hover suit lab data. It touches `window`, so it must load in the browser only. |
| Server state in the UI | TanStack Query | Loading and error states, and one invalidate refreshes the table and chart after a confirm. |
| API contract | `openapi-typescript` plus `openapi-fetch`; `api/scripts/export_openapi.py` writes a committed `api/openapi.json`, and `pnpm gen:api` turns it into a committed `web/src/api/schema.d.ts` | Pydantic models are the single source of truth; Vercel builds never need a live API. |
| JS package manager | pnpm | Fast, strict, Vercel detects it. |
| Backend language | Python 3.13 | The AI, voice, and data work is Python first. |
| Backend framework | FastAPI | Async for slow AI calls; Pydantic models double as LLM JSON schemas. |
| Python tooling | uv (`pyproject.toml` plus `uv.lock`) | One lockfile, fast installs, pins the Python version. |
| Primary DB | Supabase Postgres, used as plain Postgres (no Supabase Auth, no client SDK) | Managed, survives redeploys, free tier. Separate `dev` and `prod` projects. |
| DB access | SQLModel on SQLAlchemy 2 with the `psycopg` (v3) driver, via the Supavisor session pooler (port 5432, `sslmode=require`); engine `pool_size=5, max_overflow=0, pool_pre_ping=True, pool_recycle=300` | One class is both table and API model for CRUD; a small fixed pool never exhausts the session pooler. |
| Migrations | Alembic; `env.py` reads `DATABASE_URL` from settings and imports `app.models` (`target_metadata = SQLModel.metadata`); `script.py.mako` adds `import sqlmodel`; Railway pre deploy runs `uv run alembic upgrade head` | Schema changes for later releases (ranges, edits, protocol) stay versioned, with no URL in `alembic.ini`. |
| Analysis engine | SQL aggregate queries through SQLModel (`max`, `min`, `avg`, `count`, X vs Y points) | Deterministic, exact, returns the source trial in the same row; no pandas in the MVP. |
| LLM, primary | Ollama Cloud, open model with tool calling, via the `ollama` Python client; model in `OLLAMA_MODEL` | Team choice; no per token vendor lock; compared against Claude in the Friday model card. |
| LLM, fallback | Claude Opus 5.5 (`claude-opus-5-5`) via the `anthropic` Python SDK, effort `low`; model in `ANTHROPIC_MODEL` | Strict schema valid tool calls and strong Spanish; low effort keeps it inside the latency budget. |
| Agent orchestration | Plain tool loop in FastAPI behind an `LLMProvider` interface (no LangGraph) | Few tools, one turn per sentence; code, not the model, owns state and the save rule. |
| Speech to text | ElevenLabs Scribe, called from FastAPI, `language_code="es"`; model in `ELEVENLABS_STT_MODEL` | Strong Spanish numbers; key stays on the server; same vendor as text to speech later. |
| Audio capture | Browser `MediaRecorder`: prefer `audio/webm;codecs=opus`, else `audio/mp4` (Safari), picked with `isTypeSupported`; `audioBitsPerSecond: 32000`; clips capped at 60 s; uploaded with its MIME type when the user stops; never stored | Simple, works in Chrome and Safari, stays far under proxy body limits, honors RNF-08. |
| Access control | Personal access codes (`ACCESS_CODES`), checked by FastAPI, kept in a signed HttpOnly cookie | Only people you grant get in; delete a code to revoke. Not accounts (still deferred). |
| Web hosting | Vercel, project root `web/`, auto deploy from `main` | Native Next.js host with HTTPS (which phone mics require). |
| API hosting | Railway project `LabFlow Ai`, service `labflow-ai`, root directory `/api`, auto deploy from `main`; one replica. Set in the service settings (Railway no longer reads `railway.json` for new services): pre deploy `alembic upgrade head`, health check `/api/health`, start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --proxy-headers --forwarded-allow-ips='*'`. The free plan forces sleep when idle, so open `/api/health` once before a demo. | Proxy headers let FastAPI see HTTPS behind Railway. |
| Browser to API | Next.js rewrite: `/api/:path*` to `${API_URL}/api/:path*` | One origin: no CORS, the API URL stays in server config, the cookie just works. |
| Secrets and config | Env vars only, loaded by `pydantic-settings` in `api/`; `.env` files git ignored | Keys never reach the browser (RNF-08). |
| Observability | JSON structured logs with per step timings, read in Railway logs | Proves the 5 s target and shows every fallback; no extra service. |
| Auth (user accounts) | None in the MVP | Out of scope per the product doc; the access code gate covers the demo. |
| Background jobs, file storage, cache, search | None in the MVP | No workload needs them yet. Protocol PDF storage (feature 17) gets its own decision. |

## Architecture

**Request flow (one dictated measurement)**:
1. Browser records a clip, then `POST /api/experiments/{id}/audio` (multipart, with the clip's MIME type) through the Vercel rewrite to Railway. Bodies over 2 MB get 413 from a FastAPI body size middleware.
2. FastAPI sends the clip to Scribe, gets Spanish text, drops the audio from memory.
3. The agent service builds the context (experiment variables and units, pending proposal, last 10 turns from Postgres) and calls the `LLMProvider`.
4. The provider returns one validated tool call (intent plus arguments). Python code runs the tool against Postgres.
5. The API returns the updated proposal (or answer, or clarifying question) and the transcript. The UI shows the proposal card.
6. Typed text takes the same path from step 3 (`POST /api/experiments/{id}/utterances`), so the same sentence yields the same proposal (RF-04).

**API service layout** (`api/app/`): `routers/` (HTTP only) → `services/` (rules: proposal, confirm, query) → `repositories/` (SQLModel queries) · `ai/` (`providers/ollama.py`, `providers/anthropic.py`, `providers/fallback.py`, `agent.py`, `tools.py`, `prompts/`) · `voice/` (Scribe client) · `core/` (settings, logging, access gate). Exact routes and tables are owned by the feature specs.

**LLM provider contract**:
- `LLMProvider.decide(context, utterance) -> ToolCall` where `ToolCall` is a Pydantic model (a discriminated union, one variant per tool). Both adapters must return this exact type or raise.
- Tools: `proponer_medicion`, `corregir`, `confirmar`, `descartar`, `consultar_dato`, `graficar`, `pedir_aclaracion`. `buscar_en_protocolo` arrives with feature 17.
- Ollama adapter: `ollama.AsyncClient` with `timeout=httpx.Timeout(OLLAMA_TIMEOUT_S, connect=1.0)`; tools plus JSON schema `format`; output parsed with Pydantic.
- Claude adapter: `strict: true` tools with `tool_choice: auto` (forced tool choice returns an error on this model), `output_config={"effort": "low"}`, server side refusal fallback (`fallbacks: "default"`) enabled. Pin the `anthropic` SDK version; a smoke test calls `decide()` with a fixed utterance. Claude calls are capped at `CLAUDE_MAX_CALLS_PER_HOUR` per holder (in memory counter) to protect credits.
- **Latency budget**: the whole LLM step has one deadline, `LLM_DEADLINE_S` (default 4 s), measured from when the LLM step starts. Ollama gets `OLLAMA_TIMEOUT_S` (default 2.5 s); Claude gets whatever remains, at most `CLAUDE_TIMEOUT_S` (default 3 s), enforced with `asyncio.timeout`.
- `FallbackProvider` tries Ollama, then Claude, when Ollama raises, times out, or returns output that fails Pydantic validation. If Claude also fails or the deadline passes, the API returns 503 with "No pude procesarlo, escribe la frase", so the typed path stays usable (RNF-09). Every fallback is logged with its reason.

**Trust rules enforced in code, not in prompts**:
- The model only chooses a tool and its arguments. It never writes a number back to the user.
- Saving happens only in the confirm service, called by the confirm button or by a `confirmar` tool call made in response to the user's own utterance while a proposal is pending. No other path writes a confirmed measurement.
- Confirm is idempotent and race safe: the button sends the `proposal_id` (the LLM never supplies it; a voice `confirmar` targets the experiment's current pending proposal), the service locks that row with `SELECT ... FOR UPDATE`, and confirming an already confirmed proposal returns the saved result instead of saving twice.
- Numeric answers (`consultar_dato`) are formatted by Python templates from the SQL result, including the source trial. No second LLM call composes the reply.
- If a tool finds no data, the reply says so ("No hay registro del ensayo 9").

**Access gate**:
- `ACCESS_CODES` holds `name:code` pairs. `POST /api/access` compares the code with `hmac.compare_digest` and is limited to 5 tries per minute per IP (in memory). On success it sets cookie `labflow_session`: the holder's name signed with `itsdangerous.URLSafeTimedSerializer` using `SESSION_SECRET`, `max_age` 30 days, HttpOnly, SameSite Lax, no `Domain`, and `Secure` only when `ENV` is not `dev` (Safari drops Secure cookies on http localhost).
- A FastAPI dependency rejects every route except `/api/health` and `/api/access` with 401 when the cookie is missing, has a bad signature, is expired, or names a holder no longer in `ACCESS_CODES` (that is how revoking works).
- Next.js middleware redirects to `/access` when the cookie is absent (presence check only; FastAPI is the real check).
- Logs record the holder's name per request, never the code.

**Mic and PWA behavior**: recording starts only from a tap on the mic button (browsers require a user gesture); `getUserMedia` works on HTTPS and on localhost. A denied or missing mic shows a visible state and points to the text box. Installed iOS PWAs may ask for mic permission again on each launch; that is expected.

**Local dev**: `web/.env.local` sets `API_URL=http://localhost:8000`; `api/.env` sets `ENV=dev` and a `dev` access code; both point at the Supabase `dev` project. Commit `api/.env.example` and `web/.env.example` (no real values). A root `Makefile` target `make dev` starts both apps.

**Logging fields** (one JSON line per request): `request_id`, `route`, `holder`, `status`, `total_ms`, and when present `stt_ms`, `llm_ms`, `llm_provider`, `fallback_reason`, `db_ms`. Never log audio, codes, or keys.

## Configuration required

`api/` (Railway, and `api/.env` locally):
- `ENV`: `dev` or `prod` (controls the cookie `Secure` flag)
- `DATABASE_URL`: Supabase Postgres via the Supavisor session pooler (port 5432, IPv4 safe), `postgresql+psycopg://…?sslmode=require`
- `OLLAMA_HOST`: Ollama Cloud base URL
- `OLLAMA_API_KEY`: Ollama Cloud key
- `OLLAMA_MODEL`: the open model id
- `OLLAMA_TIMEOUT_S`: time before falling back to Claude (default `2.5`)
- `LLM_DEADLINE_S`: total budget for the LLM step (default `4`)
- `CLAUDE_TIMEOUT_S`: maximum for the Claude call (default `3`)
- `CLAUDE_MAX_CALLS_PER_HOUR`: fallback cap per holder (default `30`)
- `ANTHROPIC_API_KEY`: Claude key
- `ANTHROPIC_MODEL`: default `claude-opus-5-5`
- `ELEVENLABS_API_KEY`: ElevenLabs key
- `ELEVENLABS_STT_MODEL`: Scribe model id
- `ACCESS_CODES`: `name:code` pairs, comma separated
- `SESSION_SECRET`: signs the access cookie
- `LOG_LEVEL`: default `INFO`

`web/` (Vercel, and `web/.env.local` locally):
- `API_URL`: FastAPI base URL used by the rewrite (server side only, never `NEXT_PUBLIC_`); `http://localhost:8000` in dev

## Consequences

**Positive**:
- Every key and every write sits behind one API, so the trust principle has one place to enforce it.
- The provider interface makes the Friday model comparison a config change, not a rewrite.
- A phone can dictate too: HTTPS plus PWA install gives a hands free second device.

**Negative / tradeoffs**:
- Two LLM adapters means prompts and tool schemas are tuned twice, and the eval set must run against both.
- When Ollama fails, Claude gets only about 1.5 to 3 s inside the deadline; a slow day means a 503 and a typed retry rather than a late answer.
- One replica and one worker: fine for a demo, no horizontal scaling, and in memory rate limits reset on redeploy.
- Two hosts (Vercel and Railway) and two Supabase projects to configure; Railway costs a few dollars a month.
- Plotly is a large bundle and must stay client only.
- Access codes are shared secrets, not identity: no per user data, no audit beyond the holder name.

**Neutral**:
- Local dev runs two processes (`make dev`): `pnpm dev` in `web/` and `uv run fastapi dev` in `api/`, both against the Supabase `dev` project.
- Test tooling is chosen by `/test` (feature is `Beta`); lint and format by feature 2.
- Model ids are env driven and will be verified at build time; this space moves fast.

## Follow-up

- [ ] Verify the current Ollama Cloud model list and pick `OLLAMA_MODEL` (needs tool calling and JSON schema output, good Spanish); confirm Ollama Cloud pricing and limits.
- [ ] Verify the current ElevenLabs Scribe model id and that iOS Safari installed PWAs grant mic access.
- [ ] Tune `OLLAMA_TIMEOUT_S` and `LLM_DEADLINE_S` from logged timings once feature 6 runs end to end.
- [ ] Verify the Vercel plan's external rewrite limits (body size, proxy timeout) at scaffold time; the 2 MB and 60 s caps assume they are larger.
- [ ] Data model (feature 3) owns the conversation turn table and the pending proposal state this stack assumes.
- [ ] Record the stack and these rules in root `AGENTS.md` (`/audit`, feature 2).
- [ ] Skill conventions not yet in root `AGENTS.md` `## Agent skills`: `fastapi`, `sqlmodel`, `supabase-postgres-best-practices`, `vercel-react-best-practices` (project wide, root); `speech-to-text` (voice area, nested `api/app/voice/AGENTS.md`); `use-railway` (deploy, root pointer).
- [ ] Connect the recommended MCP servers (your own MCP settings; tools then appear automatically): Supabase (`claude mcp add supabase --transport http https://mcp.supabase.com/mcp`), Railway (`claude mcp add railway --transport http https://mcp.railway.com`), Vercel, beta (`claude mcp add vercel --transport http https://mcp.vercel.com`), Next.js devtools, needs Next.js 16+ (`claude mcp add next-devtools npx next-devtools-mcp@latest`).
- [ ] Declined for now (do not offer again): skills for uv, TanStack Query, Tailwind, pnpm, Alembic. No skill found for Ollama, Plotly, or openapi-typescript.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
