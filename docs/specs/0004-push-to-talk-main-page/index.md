# 0004. Push to talk main page

**Date**: 2026-10-28
**Status**: Proposed

## Summary

Opening LabFlow lands you on one big mic. You hold it, say a measurement, let go, and a proposal card appears to confirm; you stay on the page, ready for the next trial. The page dictates into the active notebook (picked at the top and remembered on this device), shows the last saved trial so you know where you are, and greets you with a short lab quote over a soft teal glow. It ships in Release 1 with the typed path working end to end, and the mic goes live in Release 2 with voice capture (feature 8).

## Requirements

**User stories**:
- As a student at the bench with gloves on, I want to hold one big button and talk, so that recording a trial takes seconds and no precise taps.
- As a student dictating five trials in a row, I want to stay on the same screen after each confirm, so that I keep my rhythm.
- As a student switching between experiments, I want to see which notebook I am dictating into and what was saved last, so that nothing lands in the wrong place.
- As a student on my phone, I want the same page with the mic under my thumb and the screen kept awake when the browser allows it, so that I rarely have to unlock between trials.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: `/` is the push to talk page. Top to bottom: the notebook picker and the "Último" line, the center stage (idle text, live text, or the proposal card), and the `PushToTalk` mic in the bottom thumb zone. The app shell (sidebar at 1024px and up, top bar with menu below) stays. The notebook list moves to `/cuadernos` and each notebook to `/cuadernos/[id]` (built by features 5 and 7); the sidebar's Inicio links to `/`.
- **AC-2**: The picker shows the active notebook's title with a chevron and opens a list of notebooks, most recent activity first, with "Nuevo cuaderno" last (links to `/cuadernos/nuevo`). Choosing one stores its id in this browser under `labflow.activeExperimentId`. On load the stored value is parsed as an integer; the active notebook is that id when it is still in the list, otherwise the first notebook in the list, and that fallback is written back to storage right away so it stays pinned (the list reordering after activity never changes the active notebook). Unreadable or blocked storage uses the same fallback for the session. The list is fetched on load and again when the tab regains focus. While it loads, the picker and "Último" show skeletons; if it fails, the center reads "No pudimos cargar tus cuadernos" with Reintentar and the mic is `aria-disabled`, and the no notebooks state (AC-3) is never shown for a failed load.
- **AC-3**: With no notebooks, the center shows an `EmptyState` ("Crea tu primer cuaderno", a button to `/cuadernos/nuevo`), the picker and "Último" are hidden, and the mic is `aria-disabled` with the hint "Crea un cuaderno para empezar a dictar".
- **AC-4**: Idle, the center shows "Hola." in the display serif and one lab quote from the fixed set in *Feature design*, chosen at random on each visit. The quote is picked on the client after mount (the server renders the greeting only and reserves the quote's line height), so there is no hydration mismatch and no layout shift. Behind the center sits a soft `saved` teal glow (`aria-hidden`) that breathes slowly; under reduced motion it is static.
- **AC-5**: "Último" reads `Último: Ensayo {n} · {values}` for the most recently saved trial of the active notebook: among trials with at least one confirmed measurement, the one whose measurements have the latest `coalesce(edited_at, confirmed_at)` (ties go to the higher trial number). Editing an old trial makes it "Último" on purpose: the line shows what changed last. It lists every variable of the notebook in `variable.position` order, each value through `formatQuantity` with its `measurement.unit`, and "—" for a variable with no measurement in that trial, joined by " · ". With no trials it reads "Aún no hay ensayos". It updates right after a confirm, with no reload. Its line height is reserved while loading, so nothing shifts.
- **AC-6**: The mic follows `PushToTalk` (spec 0003, AC-19): a press held 350 ms or more sends on release; a shorter press is a tap that keeps listening until the next tap; Space works as a hold and Enter toggles. A tap starts recording immediately (and asks for mic permission the first time); a forgotten tap runs until the 60 s cap (AC-8) with the timer and Cancelar visible, which is intended. Focus on load, in order: a pending card keeps spec 0003's focus rules (AC-10); otherwise, when voice is not available (AC-15) or the mic is unavailable (AC-16), the text field; otherwise the mic.
- **AC-7**: While listening, the center shows the live words in the display serif, updated as partial transcripts arrive, and the glow swells with the input level. If no partial arrives (streaming unavailable), the center reads "Escuchando…" and the level bars and timer still run. The live words are not announced word by word (`aria-live="off"`); the final transcript is announced once.
- **AC-8**: A dictation stops and sends on its own at 60 s of listening, exactly as a release would.
- **AC-9**: If listening is interrupted (the pointer is cancelled, the tab hides, or the page is left), `PushToTalk` reports `onInterrupt(elapsedMs)` instead of a release (spec 0003, AC-19), and the page sends the dictation when it ran 1 s or more and drops it silently when shorter. If the operating system kills the mic stream before the send completes (an iPhone lock or app switch), the page shows the mic idle on return with the toast "Se interrumpió el dictado"; nothing is half saved.
- **AC-10**: After sending, the mic shows "Transcribiendo…"; then the `ProposalCard` (spec 0003) takes the center. Confirm saves, and on success the page refetches the summary; the card collapses, "Último" updates, focus returns to the mic (or the text field per AC-6), and the page stays on `/`. A failed confirm shows the card's `save_error` state (spec 0003). Discard clears the card and returns focus the same way. A turn that fails while a card is pending leaves the card as it was and shows the mic's `service_error`, from which you can retry or type.
- **AC-11**: Holding the mic while a card is pending sends the dictation as a new turn in the same notebook; the server updates the pending proposal (a missing value filled, a correction applied) and the card updates in place. No second card appears. Only one request (a turn or a confirm) runs at a time: while one is in flight the mic, Enviar, and the card actions are `aria-disabled`, so a held mic, a second Enter, or a confirm cannot race an update.
- **AC-12**: The keyboard button toggles a single line text field above the mic. Enter or Enviar sends the text through the same path as a dictation (feature 6), with `source = text`; blank text cannot be sent and the field accepts at most 500 characters. After sending, the field clears, stays open, and keeps focus. The draft belongs to the current notebook and is cleared on a switch. Typing in it never triggers a card action.
- **AC-13**: Switching notebooks while a card is pending leaves that proposal pending in its notebook; switching back shows the card again. The summary (with `pending_proposal`) is fetched again on every switch and whenever the tab regains focus; the server is the source of truth, so the latest turn from any tab or device wins.
- **AC-14**: While `/` is visible, the page holds a screen wake lock; it is released when the tab hides or you leave the page, and requested again when the tab becomes visible. If the browser lacks the API or refuses, nothing is shown and nothing breaks.
- **AC-15**: Until voice capture ships (feature 8), the mic is `aria-disabled` with the hint "El dictado llega pronto. Puedes escribir.", the text field is open by default, and the typed path (AC-10, AC-12, AC-13) works end to end.
- **AC-16**: Failures keep you working: a blocked, missing, or insecure mic (`MicDockState` reasons `denied`, `no_device`, `insecure`, with spec 0003's copy) shows the reason, opens the text field, and focuses it; a speech service error shows "No te escuché bien" with the message and typing still works; a failed summary load shows "No pudimos cargar el último ensayo" with Reintentar, and dictation still works.
- **AC-17**: From 320px wide up, the same composition fits with no sideways scroll; the mic sits above `env(safe-area-inset-bottom)`; a long press on the mic opens no callout and selects no text (iOS Safari). The page works installed from the home screen (existing manifest, `display: standalone`).
- **AC-18**: The page has one `<h1>` (visually hidden: "Dictar en {notebook title}", or "Dictar" with no notebook), the glow is `aria-hidden`, state changes are announced through `PushToTalk`'s polite region, and vitest-axe reports no violations in the idle, listening, card, and empty states.
- **AC-19**: On the notebook page (`/cuadernos/[id]`), the composer dock's Dictar pill (`MicDock`, a different component from `PushToTalk`) applies the same press rules by reusing `releaseOutcome` and the `onInterrupt` contract, honors the 60 s cap and the 1 s interrupt rule, and dictates into that notebook.
- **AC-20**: `GET /api/experiments/{id}/summary` returns the notebook's id and title, `last_trial` (as in AC-5, or null) and `pending_proposal` (or null), behind the access gate; an unknown id returns 404 `experiment_not_found`. On any 401 from these endpoints the web app redirects to `/access` (feature 19).

## Decision

**Chosen option**: Option 1: Voice first main page

`/` becomes a single push to talk surface dictating into a remembered active notebook, with the notebook pages, table, and chart one tap away under `/cuadernos`.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Design source**: [`web/design.md`](../../../web/design.md) and the clickable preview at `/dev/ui/home` (built with spec 0003), plus the Mobbin voice and AI chat references listed in `rationale.md`. Composition is fixed by AC-1; spacing and motion follow `design.md`. No images or assets are needed (icons only).

**Lab quotes** (Spanish copy, one picked at random per visit; edit freely, keep them short):
1. Cada dato cuenta.
2. La curva empieza con un punto.
3. Mide con calma, anota sin errores.
4. Hoy un ensayo, mañana una conclusión.
5. La buena ciencia se anota en el momento.
6. Un número bien anotado vale por diez recordados.
7. Los resultados llegan ensayo a ensayo.
8. Tu cuaderno escucha. Tú experimentas.
9. Primero observa, luego mide, después entiende.
10. Lo que no se anota, no se midió.

**Data model sketch**: no new tables or columns. Reads `experiment`, `variable`, `trial`, `measurement` (`confirmed_at`, `edited_at`), `proposal`, and `proposal_value` from spec 0002. The active notebook lives in browser storage only (one key, an experiment id).

**State transitions** (the page, client side):
`no_notebooks` · `idle` → `listening` (press) → `processing` (release, tap again, 60 s cap, or an interrupt of 1 s or more) → `card` (proposal arrives) → `idle` (confirm settles or discard). `listening` → `idle` on Cancelar or an interrupt under 1 s. `card` → `listening` (hold to answer, AC-11) → `processing` → `card` (updated). Mic states reuse `MicDockState` (spec 0003).

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/experiments/{id}/summary` (new, this feature) | GET | `id`: int (path) | `{ id, title, last_trial: { number, saved_at, values: [{ variable_id, name, unit, value \| null }] } \| null, pending_proposal: Proposal \| null }`; `saved_at` = the trial's latest `coalesce(edited_at, confirmed_at)`, used for ordering, not displayed; `unit` = `measurement.unit`; `Proposal` = feature 6's proposal response shape | access session (feature 19) | 404 `experiment_not_found` |
| `/api/experiments` (feature 5) | GET | none | `[{ id, title, last_activity_at }]`, newest activity first | access session | none |
| Text turn (feature 6) | POST | `experiment_id`, `text`, `source = text` | the pending `Proposal` | access session | feature 6's errors |
| Voice turn (feature 8) | streaming | audio, `experiment_id` | partial transcripts, then the pending `Proposal` | access session | feature 8's errors |

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Picker | notebook list and order | `GET /api/experiments` → `title`, `last_activity_at` (feature 5) |
| Picker | active notebook | `localStorage["labflow.activeExperimentId"]` parsed as an integer if in the list, else the list's first item (then written back) |
| "Último" | trial number, values, units | summary `last_trial` ← `trial.number`; every `variable` of the notebook by `variable.position`, with `measurement.value` and `measurement.unit` (null value shown as "—") |
| "Último" | which trial is "last" | derived: among trials with a confirmed measurement, max of `coalesce(edited_at, confirmed_at)`; tie → higher `trial.number` |
| Idle center | greeting, quote | copy constants (this spec); quote index = random on the client after mount |
| Listening | live words | feature 8's partial transcript stream |
| Listening | level, elapsed time | feature 8's analyser and clock (spec 0003, AC-12) |
| Card | values, state, question | summary `pending_proposal`, then feature 6 and 8 responses (spec 0002's proposal and proposal_value) |
| Mic enabled or not | voice available | `voiceAvailable` prop from the page: `false` until feature 8 ships (AC-15) |
| `last_activity_at` | most recent activity | derived in feature 5: greatest of `experiment.created_at`, max `turn.created_at`, max `measurement.confirmed_at`, max `measurement.edited_at` |

**Key invariants**:
- Nothing is saved without a confirm (unchanged from spec 0002); the mic only ever creates or updates a pending proposal.
- One pending proposal per notebook at a time (spec 0002); a dictation while a card is pending updates it, never stacks a second card.
- Every number shown goes through `formatQuantity`.
- No global keyboard shortcuts (spec 0003, AC-10); Space only acts when the mic has focus.
- At most one turn or confirm request in flight per page (AC-11).

**Security model**: every endpoint sits behind the access gate (feature 19, spec 0001). The stored active id is only a hint: the server checks it exists and the client falls back when it does not. No audio is stored (feature 8). No new personal data.

**Configuration required**: none.

**Critical test scenarios**:
- Happy path (typed, Release 1): pick a notebook, type "Ensayo 3, 50 grados, 15 minutos, 73,5 por ciento", Enter, confirm the card; "Último" shows trial 3 and focus is back on the mic, verifies **AC-2**, **AC-5**, **AC-10**, **AC-12**, **AC-15**
- Happy path (voice, Release 2): hold, speak, release; live words show, then the card, verifies **AC-6**, **AC-7**, **AC-10**
- Failure: the tab hides 0.5 s into a dictation (dropped) and 3 s into another (sent), verifies **AC-9**
- Failure: summary returns 500; "No pudimos cargar el último ensayo" with Reintentar, dictation still works, verifies **AC-16**
- Edge: stored id of a deleted notebook falls back to the most recent; a pending card survives a notebook switch, verifies **AC-2**, **AC-13**
- Auth: summary without a session returns 401 (feature 19's gate); an unknown id returns 404, verifies **AC-20**

## Build plan

Skateboard: Slice A makes `/` a usable typed notebook in Release 1; Slice B turns the mic on in Release 2.

**Slice A (Release 1, after features 5 and 6 land)**
1. API: `last_saved_trial` in `api/app/repositories/` (the AC-5 rule, one query) and `GET /api/experiments/{id}/summary` with `pending_proposal`; pytest for the tie rule, no trials, a pending proposal, and 404; `make openapi`, satisfies **AC-5**, **AC-13**, **AC-20**
2. Web: `useActiveNotebook` (storage read and write wrapped in try/catch, integer parse, list fallback written back, refetch on focus, loading skeleton and failure state) and the picker with "Nuevo cuaderno", satisfies **AC-2**
3. Web: `/` composition (header, center stage, mic zone), idle greeting, random quote after mount, the teal glow, "Último", and the no notebooks empty state; move today's home content out and point the sidebar's Inicio at `/`, satisfies **AC-1**, **AC-3**, **AC-4**, **AC-5**
4. Web: the typed path: text field toggle, send through feature 6, the one request in flight guard, processing, card, confirm then refetch the summary, `save_error` and turn errors, summary refetch on switch and focus, the 401 redirect, mic disabled with the "llega pronto" hint and focus precedence, satisfies **AC-6**, **AC-10**, **AC-11**, **AC-12**, **AC-13**, **AC-15**, **AC-20**
5. Web: `useWakeLock` (request when visible, release on hide or leave, silent when unsupported), satisfies **AC-14**
6. Web: phone and accessibility pass (320px to 1920px, safe area, no callout, the visually hidden `<h1>`, axe in idle, card, and empty states), satisfies **AC-17**, **AC-18**

**Slice B (Release 2, with feature 8)**
7. Wire `PushToTalk` to feature 8's recorder: live partial words in the center, the glow following the level, "Escuchando…" fallback, and the final transcript announced once; flip `voiceAvailable` to true, satisfies **AC-6**, **AC-7**
8. Add `onInterrupt(elapsedMs)` to `PushToTalk` (spec 0003, AC-19); the 60 s cap and the interrupt rule (pointer cancel, `visibilitychange`, `pagehide`; send at 1 s or more; the "Se interrumpió el dictado" toast on return), satisfies **AC-8**, **AC-9**
9. Answer a pending card by voice (the dictation goes to the same notebook's pending proposal), satisfies **AC-11**
10. Failure states: mic unavailable opens and focuses the text field; service error with typing still working, satisfies **AC-16**
11. The notebook page dock's Dictar pill reuses `releaseOutcome`, `onInterrupt`, the cap, and the interrupt rule (on feature 7's page), satisfies **AC-19**

## Consequences

**Positive**:
- The core action (dictate a trial) is zero taps from opening the app, on desktop and iPhone alike.
- Staying on `/` after each confirm keeps a five trial run fast.
- No schema change; the one new endpoint is a read.

**Negative / tradeoffs**:
- The page depends on three unbuilt features (5, 6, 8) and their contracts; Slice A cannot start until 5 and 6 exist.
- Live words need streaming speech to text, which narrows feature 8's provider choice and costs more than one request per clip.
- Wake lock is unreliable on iPhone (standalone mode, Low Power Mode), so the screen may still lock; AC-14 fails silently by design.
- The active notebook is per device: switching from laptop to phone falls back to the most recent notebook, which is usually but not always the one you want.
- The table and chart move one tap away from the main page, so checking a value means opening the notebook.

**Neutral**:
- Today's home content (greeting, experiments empty state, "Cómo funciona") moves to `/cuadernos` with feature 5.
- Spec 0003 gains the `PushToTalk` component (its AC-19) and its home page AC-17 now covers the shell only.

## Follow-up

- [ ] Feature 5 spec: `GET /api/experiments` returns `last_activity_at` sorted newest first, the `/cuadernos` list and `/cuadernos/nuevo` form routes.
- [ ] Feature 6 spec: the text turn endpoint returns the pending proposal, and a turn on a notebook with a pending proposal updates it (AC-11, AC-12).
- [ ] Feature 8 spec: streaming partial transcripts are a requirement (AC-7), plus the hold to talk press model for the recorder (AC-6, AC-8, AC-9).
- [ ] Feature 7: the notebook page lives at `/cuadernos/[id]`.
- [ ] Replace the `/dev/ui/home` preview with the real page once Slice A ships.
