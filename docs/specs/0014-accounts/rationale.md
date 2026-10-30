# 0014 rationale: accounts

**Why accounts now**: codes need the team to add every person by hand, all codes share every notebook, and a session cannot be revoked. Opening LabFlow to any student needs sign up, private data, and real sessions.

**Why Supabase Auth**: the database already runs on Supabase, which ships Google sign in, email and password with confirmation and reset, rate limits on its auth endpoints, and revocable sessions. Building that ourselves would be slower and riskier.

**Why the token goes through our proxy**: the browser only calls `/api` on its own origin (spec 0001). The proxy already runs on every request, so it refreshes the Supabase session and passes the access token as a bearer header; the API never parses Supabase's cookies.

**Why verify with public keys**: Supabase signs access tokens with an asymmetric key and publishes the public half. The API checks each token locally (signature, issuer, audience, expiry) with a cached key set, so a request costs no extra call and no secret is shared.

**Why ownership in the API and not in policies**: the API is the only client of LabFlow's tables and connects directly. One ownership check per route, with 404 for anything outside the caller's space, is simpler to test than policies plus a second database role. Row level security stays on with no policies, so the browser's key reads nothing.

**Why codes get a shared space**: code users keep seeing exactly what they see today, and account users start with an empty, private list. When the codes retire, one script hands the shared notebooks to a chosen account.

**Email and password, not only a magic link**: the team's choice; it needs confirmation and reset pages, which this spec includes.
