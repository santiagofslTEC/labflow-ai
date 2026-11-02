# 0013 rationale: security hardening

**Why now**: the 2026-10-30 review confirmed that the access limit can be skipped by writing `X-Forwarded-For`, with the API public on Railway. Accounts (spec 0014) did not close it: the codes still work next to them. Everything else in this spec is cheap to add next to that fix and closes the gaps the review ranked medium.

**Why a shared secret**: the API cannot tell a browser coming through Vercel from a script calling Railway directly. Once our proxy adds a secret header, it can: requests without it are refused, and the IP our proxy passes along is the one Vercel saw, which a browser cannot forge. Vercel's IP ranges are not a fix, since every Vercel customer shares them.

**Why the global ceiling**: even with real IPs, an attacker with many addresses gets 5 tries each. A ceiling across all IPs caps the total. The cost is that a flood blocks new code sign ins for a minute; accounts sign in through Supabase and are not affected, and sessions last 30 days.

**Why no nonces**: Next.js applies nonces only to pages rendered per request. LabFlow's pages are static shells that load data in the browser, and making them dynamic would slow every page for a gain over this policy that is small next to what it already blocks.

**Why these usage numbers**: a lab session is two to three hours with one sentence every minute or two, so 120 sentences an hour is several times real use; reading instructions, making a notebook, or making a folder is a few times a session. The numbers are settings, so the team can change them without a release.

**Why audits fail on moderate**: low findings are often in build tools (like `deepmerge` under the `shadcn` CLI today) and would make CI noisy; moderate and up are worth stopping for.
