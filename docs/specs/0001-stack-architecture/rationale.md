# 0001. Stack and architecture: rationale

Build spec: [index.md](index.md).

## Context

> ⚠️ Premise note: Ollama Cloud as the primary LLM, with Claude as fallback, was the team's choice over a single proven provider. The risk is that an open model returns invalid tool calls or misreads Spanish numbers more often, which shows up as fallbacks (extra latency) or as wrong proposals the user must correct. The automatic fallback on invalid output and the confirmation card contain the damage, and the eval set will show by Friday whether Ollama earns the default. If it misses the 90 % accuracy or 5 s targets, flip the default with one env change rather than tuning harder.

LabFlow is a voice first lab notebook for chemical engineering students. The MVP demo is Friday Oct 30, 2026, three days out, built by a team of three (chemical engineering, AI and voice, product and web). The team writes Python for the backend and TypeScript for the UI.

Forces that shaped the stack:
- **Trust**: no measurement saved without explicit confirmation; every number reported must come from a database query that names its trial; every record keeps its original phrase, source, and time.
- **Latency**: a proposal within 5 s of the end of dictation (target 3 s), including speech to text and the LLM.
- **Secrets**: API keys only on the server; no audio stored.
- **Reach**: Chrome on a laptop at the bench, plus phones. Phone mics need HTTPS, so the app must be deployed even though it is not public.
- **Access**: private; only people the team grants may open it, so nobody else spends AI credits.
- **Model choice is still open**: the course decides the LLM on Friday from eval results, so the stack must allow swapping models and providers cheaply.

Not deciding now leaves features 3 to 12 without a place to build.

## Options considered

### Option 1: Next.js plus FastAPI, Supabase Postgres, Ollama Cloud with Claude fallback (chosen)

Next.js UI on Vercel proxies `/api` to a FastAPI service on Railway; Supabase Postgres via SQLModel; LLM behind an interface with two adapters.

**Pros**: Python where the AI and data live, TypeScript where the UI lives; one origin via rewrites; managed DB and hosts; model swap is config.
**Cons**: two deployables and two languages; Next.js server features go mostly unused; two LLM adapters to tune.

### Option 2: Next.js full stack in TypeScript

Route handlers as the API, a TypeScript ORM, the TypeScript LLM and ElevenLabs SDKs, one Vercel deploy.

**Pros**: one language, one deploy, one host.
**Cons**: the team wants Python for AI and analysis; serverless functions add cold starts to the latency budget; leaves the doc's FastAPI and pandas path.

### Option 3: React (Vite) single page app plus FastAPI

Same backend as Option 1; the UI is a static build served by any host or by FastAPI itself.

**Pros**: simplest front end; could ship as one service with no proxy.
**Cons**: no built in rewrite layer or routing conventions; the team prefers Next.js.

### Option 4: Python only UI (Streamlit, Reflex, or Gradio)

Everything in Python, one deploy.

**Pros**: one language, very fast to a first screen.
**Cons**: custom mic states, the proposal card, and keyboard focus are hard to get right; poor phone experience; weak fit for the "star of the demo" card.

## Rationale

Option 1 fits the team's split skills and keeps the trust principle enforceable in one place: the FastAPI service is the only component that holds keys, writes data, or talks to models, and its code (not prompts) decides when a measurement is saved and how numbers are reported. Templated numeric replies and a single tool choosing LLM call serve both RNF-04 (zero invented numbers) and RNF-02 (latency), since there is no second model call per answer.

Next.js over Vite was the team's pick. It works well here: Vercel's rewrites give one origin, so the access cookie and mic uploads need no CORS. The cost is a client only import for Plotly and a framework larger than the UI needs.

Railway over Render is about the demo: a sleeping free service can take 30 s or more on the first request. Supabase Postgres over SQLite keeps data across redeploys with zero ops. SQL aggregates over pandas because the MVP questions (max, min, average, count, one trial's value) are exact one line queries that return the source trial with the number; pandas can join later for the draft report.

The plain tool loop over LangGraph keeps state in Postgres and rules in Python, which the team can debug in three days; LangGraph's graph and checkpoints solve multi step workflows this MVP does not have. Personal access codes over real accounts give revocable, private access in about an hour, while accounts stay deferred as the product doc says.
