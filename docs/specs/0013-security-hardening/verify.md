# Verify: security hardening · spec 0013 · updated 2026-11-02
_Steps derived from spec 0013 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Manual (after the team sets `API_PROXY_SECRET` in Vercel and Railway)
- [ ] `curl -X POST https://labflow-ai-production.up.railway.app/api/access -d '{"code":"x"}' -H 'content-type: application/json'` → 403 `direct_access` → AC-2
- [ ] Sign in with Google, with email, and with a code on the production web → everything works as before → AC-1, AC-2
- [ ] Seven wrong codes in a minute from the web → the sixth answers "Demasiados intentos" → AC-3, AC-4
- [ ] A voice conversation on the production web → it connects, listens, and speaks (the CSP allows the voice SDK) → AC-5
- [ ] DevTools → Network → a page's response headers show the CSP, nosniff, Referrer-Policy, Permissions-Policy, X-Frame-Options; the console shows no CSP violation, including on /access → AC-5

## Commands
- [ ] `cd api && uv run pytest` → the gate, the attempt log, the usage windows, the headers → AC-2 to AC-6
- [ ] `cd web && pnpm test` → the proxy's headers → AC-1
- [ ] `cd web && pnpm test:e2e` → headers on every page, no CSP violation → AC-5
- [ ] CI → the audit steps run in both jobs → AC-7

## Acceptance-criteria coverage
- AC-1, AC-2 · Manual and Vitest, pytest
- AC-3, AC-4, AC-6 · pytest
- AC-5 · Playwright and the manual voice check
- AC-7 · CI
