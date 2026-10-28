# 0004 rationale: push to talk main page

## Context

> ⚠️ Premise note: this page assumes features 5 (notebooks), 6 (text capture and the proposal), 8 (voice capture), and 19 (the access gate) and has no spec for 5, 6, or 8 yet. Their contracts are stated as requirements in `index.md` (*API surface*, *Follow-up*) so their specs inherit them; Slice A waits for 5 and 6, Slice B for 8.

LabFlow's users dictate measurements at the bench with gloves on, often on a phone. The product promise is "dictate, confirm, done", but until now the app opened on a dashboard and the mic lived in a dock at the bottom of a notebook page, two steps away. Spec 0003 built the pieces (proposal card, mic dock, the push to talk component) but not the page that puts dictation first.

Forces: a five trial run should feel like one rhythm, not five navigations; the screen must say which notebook you are dictating into, because a value saved into the wrong experiment is the worst error after an invented number; phones auto lock between trials; and the Friday demo needs the typed path working before voice exists (Skateboard).

## Options considered

### Option 1: Voice first main page

`/` is one big push to talk mic over a quiet center, dictating into a remembered active notebook; notebooks live under `/cuadernos`.

**Pros**: zero taps to dictate; same layout on phone and desktop; the card, the last row, and the mic share one focused screen.
**Cons**: the table and chart are one tap away; depends on three unbuilt features.

### Option 2: Notebook dashboard home with a dock everywhere

`/` lists notebooks; each notebook page has the compact composer dock (today's build).

**Pros**: already built; table and chart always beside the mic.
**Cons**: one extra tap per session; the small dock pill is a poor target with gloves; the phone layout splits attention across tabs.

### Option 3: Separate `/dictar` capture page

Keep `/` as a dashboard and add a dedicated capture page.

**Pros**: no change to the home; capture is still one focused screen.
**Cons**: the most common action lives off the main route; two entry points to explain.

## Rationale

Option 1 matches the job users hire LabFlow for: get a measurement recorded correctly with busy hands. Every voice app reviewed (OpenPhone, Quo, Claude voice, Copilot, Voicenotes, ElevenLabs) puts one large control in the thumb zone and keeps the rest quiet, and the bench context makes that even more true. The active notebook picker plus "Último" answers the wrong notebook risk without bringing the table onto the page. Hold to talk fits short dictations; the tap fallback and Enter toggle keep it usable for gloves that cannot hold and for screen readers. Staying on `/` after confirm keeps the run's rhythm. Remembering the notebook per device needs no schema change, which matters with the demo on Friday; server side memory can come later if cross device switching proves annoying.

Option 2 is cheaper today but leaves the core action two steps deep and on a small target. Option 3 solves the focus problem but hides it behind a route nobody opens first.

Decisions made by the engineer during design: hold to talk with a tap fallback, the active notebook picker remembered per device, staying on `/` after confirm, live words while holding, holding the mic answers a pending card, a 60 s cap, focus on the mic at load instead of a global shortcut, the last saved trial by recency, the compact dock kept on the notebook page, a wake lock, pending cards staying with their notebook, "Hola." plus a random lab quote per visit, the teal glow, no suggestion chips, no name in the greeting, the 1 s interrupt rule, Release 1 typed then Release 2 voice, and the single summary endpoint.

Decided while writing: the hold threshold (350 ms, long enough that a deliberate tap never counts as a hold, short enough that a hold feels instant; runner up 250 ms, which misreads slow taps), and picking the quote on the client after mount (runner up: pick per request on the server, which conflicts with `cacheComponents` caching of the page shell).

### Design references (Mobbin)

Voice and push to talk: OpenPhone (https://mobbin.com/screens/620df303-e671-4766-8109-e2095fad7e5d), Quo (https://mobbin.com/screens/60735723-eb81-40e8-a1b0-bccec827fa9e), Claude voice (https://mobbin.com/screens/cf19a222-e22f-4cdf-a030-6712ef5ab8b0), Copilot voice (https://mobbin.com/screens/dde18761-b196-4a1d-919e-10fbe3421871), Voicenotes web (https://mobbin.com/screens/98687162-00ab-4388-9b1b-b82c617240ee), ElevenLabs voice orb (https://mobbin.com/screens/cf492872-e47b-453b-b476-0b5495411a83).
AI chat homes (greeting, glow): SchoolAI (https://mobbin.com/screens/9f4e0804-c3ff-4456-aa14-07c8d7ad852f), Google Gemini (https://mobbin.com/screens/522dc6ec-0d62-4b7d-8d70-5b78ea859ac3), Copilot (https://mobbin.com/screens/ababd41c-bdce-441b-9fbe-c13ed2dff0e5).
