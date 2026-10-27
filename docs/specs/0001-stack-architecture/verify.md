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
