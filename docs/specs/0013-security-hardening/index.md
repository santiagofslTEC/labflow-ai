# 0013. Security hardening: the proxy secret, the access limit, headers, usage limits, and audits

**Date**: 2026-11-02
**Status**: Proposed

## Summary

A security review of the whole project (2026-10-30) found that the access code limit (5 tries a minute per IP, spec 0001) can be skipped: the API takes the client IP from the first `X-Forwarded-For` value, which any caller writes, and the Railway API is public, so a script can call it directly with a new fake IP on every try (confirmed: 7 tries with fake IPs gave 7 × 401 and no 429). The same log grows without bound. The review also found no security headers on the web app, no usage limits per person except Claude's (30 calls an hour), and no dependency audit in CI. Since then accounts landed (spec 0014): Supabase limits its own sign in attempts, but the access codes still work next to the accounts, and every account can now run up the model bill or fill the database on its own. This spec closes those gaps: the web app's proxy signs every `/api` request with a shared secret and passes the browser's IP, the API refuses requests that skip the web app and trusts only that IP, the attempt log is bounded with a global ceiling, every page gets a Content Security Policy and the standard headers, each person (account or code) gets hourly limits on what costs money or storage, and CI fails on a known vulnerability. Revoking one session and separating data by group are out of scope (spec 0014 already gives each account its own notebooks).

## Requirements

**User stories**:
- As the team, we want the access code limit to hold against a script, so that a code cannot be guessed by brute force while codes still work.
- As the team, we want the API to answer only our web app (and ElevenLabs on its own endpoint), so that every rule the web app relies on also holds for direct calls.
- As a student, I want my notebooks safe from a page that injects scripts or frames LabFlow, so that my data and my session stay mine.
- As the team, we want one account or code to be unable to run up the model bill or fill the database, so that an abused account costs little.
- As the team, we want CI to stop a dependency with a known vulnerability, so that we learn about it before it ships.

**Acceptance criteria**:

- **AC-1**: Proxy secret (web). `web/src/proxy.ts`, which already forwards `/api` requests with the account's bearer token (spec 0014, AC-4), also sets two headers itself, overwriting any the browser sent: `x-labflow-proxy` = `API_PROXY_SECRET` (a server only env var, never `NEXT_PUBLIC_`, at least 32 characters), and `x-labflow-client-ip` = the first `x-forwarded-for` value of the incoming request (Vercel sets that header to the browser's address and drops any the browser sent). When `API_PROXY_SECRET` is unset (local dev), it adds neither.
- **AC-2**: Proxy secret (API). A new optional setting `API_PROXY_SECRET` (at least 32 characters when set). When set, every request except `GET /api/health` and the voice Custom LLM (`/api/voice/llm/chat/completions`, which ElevenLabs calls directly with its own bearer secret, spec 0007) must carry `x-labflow-proxy` equal to it (`hmac.compare_digest`), or the API answers 403 `direct_access` ("Usa LabFlow desde su página."). When unset, the API logs one WARNING at startup outside dev ("API_PROXY_SECRET is not set: direct calls are accepted") and behaves as today.
- **AC-3**: Client IP. The access limit's IP is `x-labflow-client-ip` only when the request carried the right `x-labflow-proxy`; otherwise it is the socket's peer address. `X-Forwarded-For` is never read by the API.
- **AC-4**: Bounded attempt log. Before each access code attempt, entries older than the 60 s window are dropped. On top of the 5 tries a minute per IP, a global ceiling of 60 failed tries a minute across all IPs answers 429 `too_many_attempts` (the existing message) to every new try until the minute passes; signed in sessions (codes or accounts) are never affected, and Supabase sign in is not involved. The log never holds more than 10 000 IPs: past that, the oldest entries are dropped.
- **AC-5**: Security headers on every page (`next.config.ts` `headers()`, all paths but `/api`, `/_next/static`, and `/_next/image`):
  - `Content-Security-Policy`: `default-src 'self'`; `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob: data:` (plus `'unsafe-eval'` in dev only, which React's dev build needs); `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`; `font-src 'self' data:`; `connect-src 'self'`, the Supabase project (`NEXT_PUBLIC_SUPABASE_URL`, https and wss), `https://api.elevenlabs.io wss://api.elevenlabs.io wss://livekit.rtc.elevenlabs.io https://*.livekit.cloud wss://*.livekit.cloud`; `media-src 'self' blob:`; `worker-src 'self' blob:`; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'none'`; and `upgrade-insecure-requests` in production. The ElevenLabs and LiveKit origins and the `blob:` and `data:` script sources are what the voice SDK uses for its connection and its audio worklets (read from `@elevenlabs/client`); Google sign in is a full page redirect, so it needs no entry.
  - `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Strict-Transport-Security: max-age=63072000; includeSubDomains`, and `Permissions-Policy: microphone=(self), camera=(), geolocation=(), payment=(), usb=()`.
  - The API adds `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` to every response, so no shared cache keeps notebook data.
- **AC-6**: Usage limits per person (the principal's holder of spec 0014: an account's email or a code's name), as sliding one hour windows held in `app.state` like the Claude cap (per process, reset on redeploy): 120 sentences (typed or spoken), 20 instruction reads, 30 new notebooks (with or without instructions), 30 new folders, and 30 voice sessions. One over answers 429 `too_many_requests` ("Vas muy rápido. Espera unos minutos y vuelve a intentar."), and a spoken turn over the limit is spoken with that text. The limits are settings with these defaults. The web shows the API's message for a 429 wherever it shows an API error today.
- **AC-7**: Supply chain. `shadcn` moves to `devDependencies` (it is only read at build time, by `globals.css`). The CI `web` job runs `pnpm audit --prod --audit-level=moderate`, and the `api` job runs `pip-audit` on `uv export --no-dev`; a moderate or worse known vulnerability fails the job.
- **AC-8**: Tests: unit tests for the IP rule, the bounded log and its global ceiling, the proxy check (right, wrong, missing, open paths), the usage windows (one per kind), and the API's headers; a web test for the proxy's two headers next to the bearer; Playwright checks that every page answers with the CSP and the other headers and logs no CSP violation in the console.

## Decision

**Chosen option**: a shared secret between the web app and the API, set by the web app's proxy, so the API can tell our traffic from direct calls and trust the IP Vercel saw; plus bounded, global limits, standard headers, per person windows, and audits in CI.

**Calls made in this spec** (reasoning in [rationale.md](rationale.md)):
- **A proxy secret over Railway's private networking**: the web app runs on Vercel, outside Railway, so the API has to stay public; the secret makes it answer only us. Runner up: an allowlist of Vercel's IP ranges, which change and are shared with every Vercel customer.
- **The secret is optional at first** (AC-2): it needs `API_PROXY_SECRET` set in both Vercel and Railway, which the team sets by hand (we never change Railway variables from the repo). A required setting would stop the API from starting until then. Once both are set, a follow up makes it required outside dev.
- **A CSP with `'unsafe-inline'` scripts, not nonces**: nonces need every page rendered per request, which turns off the static pages and the caching LabFlow uses. This CSP still blocks other origins, plugins, framing, form posts elsewhere, and `<base>` hijacking, and limits where data can be sent (`connect-src`).
- **Limits in memory, per process**, like the Claude cap: one Railway worker today. Runner up: a Postgres table, more writes on every sentence for the same effect at this size.

**Implementation skills**: `fastapi` · `vercel-react-best-practices`

## Feature design

**Data model**: none; no migration.

**API surface**: no new routes. New codes: 403 `direct_access`, 429 `too_many_requests`. New settings: `API_PROXY_SECRET` (optional), `MAX_SENTENCES_PER_HOUR` (120), `MAX_INSTRUCTION_READS_PER_HOUR` (20), `MAX_NOTEBOOKS_PER_HOUR` (30), `MAX_FOLDERS_PER_HOUR` (30), `MAX_VOICE_SESSIONS_PER_HOUR` (30).

**Code**: `api/app/core/gate.py` (proxy check, `client_ip`), `api/app/core/access.py` (pure: the bounded log and the global ceiling), `api/app/core/usage.py` (new, pure windows plus the `app.state` holder), the routers that count (capture, voice, experiments, folders), a headers middleware in `main.py`; `web/src/proxy.ts`, `web/next.config.ts`, the web's 429 handling; `.github/workflows/ci.yml`; `api/.env.example` and `web/.env.example` document `API_PROXY_SECRET`.

**Key invariants**: the API never reads `X-Forwarded-For`; a header named `x-labflow-*` from the browser never reaches the API as sent; the voice Custom LLM and health stay reachable without the proxy secret.

**Security model**: the proxy secret is a second factor for "this came through our web app", not a user credential; identity still comes from Supabase or an access code (spec 0014). Rotating it means setting a new value in Vercel and Railway together.

## Build plan

1. API: the IP rule, the bounded log, the global ceiling; tests, satisfies **AC-3**, **AC-4**
2. API: the proxy check and the headers middleware; tests, satisfies **AC-2**, part of **AC-5**
3. Web: the proxy's headers and the page headers; tests and Playwright, satisfies **AC-1**, **AC-5**
4. API and web: the usage windows, the 429 message in the web; tests, satisfies **AC-6**
5. `shadcn` to dev dependencies; the audits in CI, satisfies **AC-7**
6. Docs: `.env.example` files, scope.

## Consequences

**Positive**: brute forcing a code stops working; direct calls to Railway are refused once the secret is set; an abused account is capped; injected scripts cannot load from or send data to other origins; vulnerable dependencies fail CI.

**Negative / tradeoffs**: one more secret to keep in two places; a global ceiling means a flood of wrong codes can block new code sign ins for a minute (accounts and signed in users keep working); the CSP must be updated if the voice SDK or the Supabase project changes its domains.

## Follow-up

- [ ] Team: set `API_PROXY_SECRET` (the same random value, `openssl rand -hex 32`) in Vercel (all environments) and in the Railway service; then make it required outside dev.
- [ ] Team: while codes still work, replace them with 20 or more random characters, one per person; retire them when everyone has an account (spec 0014, AC-9).
- [ ] Later spec: revoke one session from LabFlow (Supabase can already sign a user out everywhere).
- [ ] Later: a least privilege Postgres role for the API, and Supabase backups (PITR).
- [ ] Later: a request body size limit at the edge.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
