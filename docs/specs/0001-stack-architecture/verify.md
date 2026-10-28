# Verify: Stack & architecture · spec 0001 · updated 2026-10-27
_Steps come from the scope's "Done when" (spec 0001 is a decision spec with no numbered ACs, so the items are DW-1 and DW-2). `/check verify` runs these; `/test` locks the ones that should last._

- **DW-1**: the stack is recorded in a spec.
- **DW-2**: the empty scaffold boots locally, and the front end talks to the backend.

## UI / manual
- [x] Run `make dev` from the repo root, then open `http://localhost:3000` → the page shows "LabFlow AI" and "Conectando con la API…" changes to "API conectada (dev)" → DW-2
- [x] Stop only the API (or run `make web` by itself), then reload the page → it shows "La API no responde. ¿Está corriendo en el puerto 8000?" → DW-2
- [x] Open DevTools, Network tab → the health call goes to `localhost:3000/api/health` (same origin, no CORS preflight) and never to port 8000 → DW-2

## Commands
- [x] `curl -s localhost:8000/api/health` → `{"status":"ok","env":"dev"}` → DW-2
- [x] `curl -s localhost:3000/api/health` → the same JSON, served through the Next.js rewrite → DW-2
- [x] `make openapi` → it rewrites `api/openapi.json` and `web/src/api/schema.d.ts`, and `git diff` shows no change unless a route changed → DW-2
- [x] `cd web && pnpm typecheck && pnpm lint` → both pass with no errors → DW-2
- [ ] `cd web && pnpm build` with `API_URL` unset and `NODE_ENV=production` → the build fails with "API_URL must be set for production builds" → DW-2
- [x] `grep -n '^\*\*Status\*\*' docs/specs/0001-stack-architecture/index.md` → the spec exists with its stack table → DW-1

## Acceptance-criteria coverage
- DW-1: covered by the last command step.
- DW-2: covered by every UI step and the first five command steps.

# Verify: access code gate · spec 0001 (Access gate) · updated 2026-10-28
_Steps derived from spec 0001's Access gate section and the scope's feature 19 "Done when". The spec has no AC ids for the gate, so they are named here: AG-1 every route but `/api/health` and `/api/access` returns 401 without a valid session · AG-2 the web app redirects to `/access` · AG-3 a valid code lets you in and the holder name reaches routes · AG-4 the code is safe to guess at (5 tries a minute, cookie flags, revoking)._

## UI / manual
- [ ] Clear cookies for localhost, run `make dev`, open `http://localhost:3000/` → you land on `/access` (no sidebar): "LabFlow", "Entra a tu cuaderno", one "Código de acceso" field, a black "Entrar" button, disabled while the field is empty → AG-2
- [ ] Open `http://localhost:3000/dev/ui` with no cookie → the address becomes `/access?next=%2Fdev%2Fui` → AG-2
- [ ] Type a wrong code, press Enter → an alert under the field reads "Ese código no es válido. Revisa que esté bien escrito." with a small red icon; typing again clears it → AG-4
- [ ] Type your `ACCESS_CODES` code → you go back to `/dev/ui` (the `next` page) with the sidebar → AG-3
- [ ] DevTools, Application, Cookies → `labflow_session` is HttpOnly, SameSite Lax, about 30 days, no Domain; Secure only on the deployed (prod) site → AG-4
- [ ] Remove your name from `ACCESS_CODES` in `api/.env` and restart the API, then reload a page that calls the API → you are sent to `/access` → AG-1, AG-4
- [ ] At 390px wide (iPhone), `/access` shows one centered column with no sideways scroll → AG-2

## Commands
- [ ] `curl -s -w ' %{http_code}\n' localhost:3000/api/health` → `{"status":"ok","env":"dev"} 200` without a cookie → AG-1
- [ ] `curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' localhost:3000/` → `307 http://localhost:3000/access` → AG-2
- [ ] `curl -s -w ' %{http_code}\n' -X POST localhost:3000/api/access -H 'content-type: application/json' -d '{"code":"nope"}'` → `{"code":"invalid_access_code",…} 401` → AG-4
- [ ] The same wrong code 6 times within a minute → five 401s, then `{"code":"too_many_attempts",…} 429` → AG-4
- [ ] POST the right code with `-c jar` → `{"holder":"<your name>"} 200` and a `labflow_session` cookie in the jar → AG-3
- [ ] Once feature 5 adds a gated route: call it without the cookie → `{"code":"unauthorized",…} 401`; with `-b jar` → 200, and `experiment.created_by` is your holder name → AG-1, AG-3
- [ ] Start the API with `ACCESS_CODES` or `SESSION_SECRET` (under 32 characters) missing → it refuses to start → AG-4
- [ ] `cd web && pnpm test src/lib/access.test.ts src/api/client.test.ts src/app/access` → all pass → AG-2, AG-3

## Acceptance-criteria coverage
- AG-1: health command, the revoke step, and the feature 5 gated route step.
- AG-2: the first two UI steps, the phone step, the redirect command, and the web tests.
- AG-3: the right code UI step, the POST command, and the feature 5 step.
- AG-4: the wrong code, cookie, revoke, rate limit, and missing env steps.
