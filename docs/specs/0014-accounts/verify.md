# Verify: accounts · spec 0014 · updated 2026-10-30
_Steps derived from spec 0014 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## Manual (with Supabase configured, on a Vercel preview)
- [ ] Continuar con Google → back on `/` signed in; Ajustes shows the name, the email, and "Google" → AC-1, AC-7
- [ ] Crear cuenta with a new email → "Te enviamos un enlace…"; open it → signed in on `/` → AC-2
- [ ] Crear cuenta with that same email again → the same message, nothing else → AC-2
- [ ] Wrong password → "Correo o contraseña incorrectos." → AC-1
- [ ] ¿Olvidaste tu contraseña? → the link → a new password → signed in → AC-3
- [ ] Account A makes a notebook; account B signs in → the list is empty; B opens `/cuadernos/{A's id}` → "Este cuaderno no existe" → AC-6
- [ ] Tengo un código de acceso → the code works and shows the shared notebooks, not A's → AC-9
- [ ] Cerrar sesión → back on `/access`; Back in the browser does not show the notebook → AC-4

## Commands
- [ ] `cd api && uv run pytest` → token verification, ownership on every route, the assign script → AC-5, AC-6, AC-9, AC-10
- [ ] `cd web && pnpm test` → the access pages, the proxy, Ajustes, axe → AC-1 to AC-4, AC-7, AC-11
- [ ] `cd web && pnpm test:e2e` → the access pages fit the phone → AC-11

## Acceptance-criteria coverage
- AC-1 to AC-4, AC-7, AC-11 · Vitest, Playwright, manual
- AC-5, AC-6, AC-9, AC-10 · pytest
- AC-8 · the RLS check of spec 0002 and a review that no secret key is in the web app
