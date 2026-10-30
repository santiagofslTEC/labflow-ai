# 0014. Accounts: sign in with Google or email and password (Supabase Auth)

**Date**: 2026-10-30
**Status**: In Progress

## Summary

Today LabFlow lets people in with shared access codes kept in a Railway variable: a new person means editing that variable, every code sees and edits every notebook, and a stolen session cannot be revoked. This spec adds real accounts with Supabase Auth, which the project already runs on: anyone can create an account with Google or with an email and password (confirmed by email, with "olvidé mi contraseña"), and each account sees and edits only its own notebooks. The access codes keep working for a while next to the accounts (team decision, 2026-10-30), inside their own shared space, so nobody is locked out during the switch; a later step retires them and hands the shared notebooks to one account. The browser still calls only `/api` on its own origin: the web app's proxy keeps the Supabase session fresh and passes its access token to the API, which verifies it against Supabase's public signing keys. One migration adds the notebook's owner.

## Requirements

**User stories**:
- As a student, I want to sign in with my Google account or create one with my email, so that I do not need a code from the team.
- As a student, I want my notebooks private to me, so that other students cannot read or change my data.
- As a student, I want to reset a forgotten password by email, so that I do not lose my notebooks.
- As the team, we want the people who use codes today to keep working until they switch, so that the change breaks nothing mid practice.

**Acceptance criteria**:

- **AC-1**: `/access` becomes "Entrar a LabFlow" with three ways in, in this order:
  - "Continuar con Google" (Supabase OAuth with PKCE, back through `/auth/callback`).
  - An email and password form: Entrar, plus the links "Crear cuenta" and "¿Olvidaste tu contraseña?".
  - A quiet link "Tengo un código de acceso", which shows today's code form (AC-9).
  Any error is shown in Spanish inside the form ("Correo o contraseña incorrectos.", "Confirma tu correo antes de entrar; te enviamos un enlace.", "No pudimos entrar con Google. Intenta de nuevo."). Pressing Entrar twice sends one request. After signing in, the user lands on the page they were going to (the existing `next` parameter, same origin paths only).
- **AC-2**: "Crear cuenta" (`/access/crear`): name (optional, at most 80 characters), email, password (at least 10 characters), and Crear cuenta. Supabase sends a confirmation email; the page says "Te enviamos un enlace a {email}. Ábrelo para activar tu cuenta." The link lands on `/auth/confirm`, which signs the user in and opens `/`. An email that already has an account gets the same message, so the form never tells whether an email is registered.
- **AC-3**: "¿Olvidaste tu contraseña?" (`/access/recuperar`): email and "Enviar enlace", always answered with "Si hay una cuenta con ese correo, te enviamos un enlace." The link opens `/access/nueva-contrasena`, which asks for the new password twice (at least 10 characters, equal) and signs the user in.
- **AC-4**: The session. `@supabase/ssr` keeps the session in its cookies (`HttpOnly` is not possible for them, so no token is ever written to `localStorage` either). `web/src/proxy.ts` refreshes the session on every page and `/api` request; a page with neither a Supabase session nor a valid code cookie redirects to `/access?next=…` as today. For `/api` requests it forwards `Authorization: Bearer {access_token}` and drops any `Authorization` header the browser sent. "Cerrar sesión" in Ajustes signs out of Supabase (this device) and clears the code cookie.
- **AC-5**: The API verifies the bearer token as a Supabase access token: signature against the project's JSON Web Key Set (`{SUPABASE_URL}/auth/v1/.well-known/jwks.json`, fetched once and cached for 10 minutes, refetched on an unknown key id), `iss` = `{SUPABASE_URL}/auth/v1`, `aud` = `authenticated`, not expired, and not an anonymous user. Supabase issues no token to an unconfirmed email while "Confirm email" is on, so a valid token means a confirmed account (the token itself carries no confirmation claim). The result is a principal: an account (`user_id` from `sub`, `email`, `name` from the user metadata or the email) or, with no bearer, a code holder from the code cookie (AC-9). A bad, expired, or missing credential is 401 `unauthorized` ("Tu sesión venció. Entra de nuevo."). A principal replaces today's holder name everywhere: `created_by`, `saved_by`, logs, the Claude cap, the instruction reads, the voice session token, and the usage limits of spec 0013 key on `user:{id}` or `code:{name}`.
- **AC-6**: Ownership. A new nullable column `experiment.owner_id uuid` (indexed). A notebook made by an account gets `owner_id` = its user id; one made with a code gets null. An account sees and changes only notebooks with its `owner_id`; a code holder sees and changes only notebooks with a null `owner_id` (today's shared space). Every route that takes a notebook, a variable, or a card id checks this through one function, and anything outside the principal's space answers 404 as if it did not exist (`experiment_not_found`, `variable_not_found`, `proposal_not_found`), never 403, so ids reveal nothing. The notebook list, the home's recent notebooks, and the sidebar list only the principal's notebooks. The voice session is only started for a notebook the principal can see, and its token carries that check.
- **AC-7**: Ajustes shows the account: name, email, and how it signs in ("Google" or "Correo y contraseña"), or "Código de acceso: {name}" for a code holder, with Cerrar sesión.
- **AC-8**: Supabase's tables stay closed to the browser. Every LabFlow table keeps row level security on with no policies (spec 0002), so the publishable key the web app ships cannot read or write them; the API reaches Postgres directly as today. The publishable key is the only Supabase value with a `NEXT_PUBLIC_` prefix; the service role key is never used.
- **AC-9**: Coexistence. While `ACCESS_CODES` is set, the code form and the code cookie work exactly as today, in the shared space of AC-6. `scripts/assign_shared_notebooks.py --email {email}` (run by the team when the codes retire) gives every notebook with a null `owner_id` to the account with that email, in one transaction, and prints how many; with `--dry-run` it only counts. Removing `ACCESS_CODES` then turns the code form off (the link is hidden when the API reports no codes).
- **AC-10**: Without Supabase settings (local dev and tests), the API accepts only codes, and the web hides Google and the email form; everything else works as today.
- **AC-11**: Accessibility and phone: every form has visible labels, errors sit under their field and are announced, focus moves to the first error, passwords have a show and hide button, the pages fit from 320px (spec 0010, the Playwright suite checks them), and vitest-axe reports no violations on each page and state.
- **AC-12**: Tests: the token verification (good, bad signature, wrong issuer, wrong audience, expired, unknown key id, unconfirmed email) against a local key set; ownership on every route (an account's notebook is 404 for another account and for a code, and a shared notebook is 404 for an account); the assign script; the web forms and their errors with Supabase mocked; Playwright for the access pages on the phone.

## Decision

**Chosen option**: Supabase Auth in the web app with `@supabase/ssr`; the web app's proxy forwards the access token, and the API verifies it with Supabase's public keys and enforces ownership in its queries.

**Calls made in this spec** (team choices on 2026-10-30: Google plus email and password, anyone can sign up, each account sees its own notebooks, codes coexist for a while; reasoning in [rationale.md](rationale.md)):
- **The API verifies tokens itself** with the project's public keys, so no network call per request and no secret shared with Supabase. Runner up: call Supabase's `/auth/v1/user` on every request, a round trip each time.
- **Ownership is checked in the API**, not with Supabase policies, because the API connects to Postgres directly and is the only client of these tables. Runner up: per user policies and a user scoped database connection, a second way in for no gain.
- **404, not 403**, for another person's notebook, so a guessed id does not confirm that it exists.
- **Codes keep a shared space** (null owner) so code users see what they see today and account users start clean.

**Implementation skills**: `fastapi` · `supabase-postgres-best-practices` · `vercel-react-best-practices`

## Feature design

**Data model**: migration adds `experiment.owner_id uuid null` with an index on `(owner_id, id)`. No foreign key to `auth.users`: the API never reads that schema, and deleting an auth user should not cascade silently into lab data. `created_by` and `saved_by` keep a readable name (the account's name or email, or the code holder's name).

**API surface**: no new routes. Every route depends on `PrincipalDep` instead of `HolderDep`. `GET /api/access` (who am I) returns `{kind: "account" | "code", name, email, provider}` and whether codes are enabled. New settings: `SUPABASE_URL` (optional; accounts are off without it). The access code limit and the proxy secret of spec 0013 still apply.

**Web**: `@supabase/ssr` and `@supabase/supabase-js`; `lib/supabase/{client,server}.ts`; `proxy.ts` (refresh, redirect, bearer); `app/access/{page,crear,recuperar,nueva-contrasena}`; `app/auth/{callback,confirm}/route.ts`; Ajustes. Env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

**Supabase project settings (the team sets them in the dashboard)**: Google provider (a Google Cloud OAuth client); email provider with "Confirm email" on and minimum password length 10; Site URL and redirect URLs for production, `http://localhost:3000`, and the Vercel previews; a custom SMTP sender before real users (Supabase's built in sender is rate limited and meant for testing).

**Key invariants**: no API route returns or changes a notebook outside the principal's space; the browser never sends a token the proxy did not set; no Supabase secret key exists in the web app.

**Security model**: identity comes from Supabase (Google or a confirmed email); authorization (who owns what) is ours, in the API. Sessions are revocable from Supabase (sign out everywhere, delete the user).

## Supabase checklist (the team, in the dashboard)

1. Authentication → Providers → Google: on, with a Google Cloud OAuth client (Web application; authorized redirect URI `https://{project}.supabase.co/auth/v1/callback`).
2. Authentication → Providers → Email: on, "Confirm email" on, minimum password length 10.
3. Authentication → URL Configuration: Site URL = the production web URL; Redirect URLs = `{production}/auth/callback`, `http://localhost:3000/auth/callback`, and `https://*-santiagofsltecs-projects.vercel.app/auth/callback` for previews.
4. Optional, so email links also work when opened on another device: in Email Templates, point "Confirm signup" and "Reset password" to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email` (and `type=recovery`).
5. Project Settings → JWT Keys: the project signs with the new asymmetric keys (the API reads the public JWKS). If it still uses the legacy shared secret, migrate to signing keys first.
6. Before real users: Authentication → SMTP with a custom sender.
7. Env: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel; `SUPABASE_URL` in Railway; deploy runs the migration.

## Build plan

1. API: `principal.py` (token verification with a cached key set, the principal type), `PrincipalDep`, `GET /api/access`; tests with a local key set, satisfies **AC-5**, **AC-10**
2. API: the migration, ownership in every repository and route, the voice token; tests, satisfies **AC-6**
3. API: the assign script; tests, satisfies **AC-9**
4. Web: Supabase clients, `proxy.ts`, `/auth` routes; tests, satisfies **AC-4**
5. Web: `/access` and its three pages, Ajustes; tests, axe, Playwright, satisfies **AC-1** to **AC-3**, **AC-7**, **AC-11**
6. Docs: `.env.example` files, the Supabase settings checklist, scope; `make openapi`.

## Consequences

**Positive**: anyone can start without the team; each student's data is private; sessions can be revoked; usage limits become per person.

**Negative / tradeoffs**: two ways in during the switch; the team must configure Google and email in Supabase and add an SMTP sender; Supabase's session cookies are readable by page scripts (the CSP of spec 0013 matters more).

## Follow-up

- [ ] Team: configure Supabase (Google, email, URLs, SMTP) and set the env vars in Vercel and Railway.
- [ ] Team: when everyone has an account, run the assign script and remove `ACCESS_CODES`.
- [ ] Later: share a notebook with other accounts (members and roles).
- [ ] Later: delete my account and my data.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
