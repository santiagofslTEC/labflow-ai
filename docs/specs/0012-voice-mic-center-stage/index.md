# 0012. The mic at center stage on the notebook page

**Date**: 2026-10-30
**Status**: Proposed

Builds on spec 0007 (the voice session, AC-24 thinking state, AC-26 tentative words) and spec 0011 (what a turn saves and says). Replaces spec 0007's small "Hablar" button on `/cuadernos/[id]` (AC-19) and the hero mic on `/` (AC-1, AC-2 visuals) with one shared component.

## Summary

Voice becomes the notebook page. A big mic sits in the middle of the capture column with a bar meter that moves with your voice, then a slow "thinking" pulse while LabFlow works, then LabFlow's level while it speaks. Your words appear as you say them, LabFlow's reply shows under them, and stopping leaves a one line summary ("Terminado · 0:48 · 2 guardados"). Typing stays right below as the fallback. The look is a lab instrument in your green on warm paper, not an AI orb.

## Requirements

**User stories**:
- As a student at the bench, I want the mic to be the first thing on the notebook page, so that I start talking without hunting for a button.
- As a student, I want to see that LabFlow hears me and then that it is working, so that I never wonder whether to repeat myself or tap stop.
- As a student, I want to read what LabFlow understood and answered, so that I catch a wrong number at a glance.

**Acceptance criteria**:
- **AC-1**: Layout (center stage). On `/cuadernos/[id]` for an open notebook, the capture column shows, in order: the compact notebook header (title, Abierto badge, context collapsed to one line), the mic stage (meter, mic button, state line with elapsed time), the transcript area (your words, LabFlow's reply), the save notice and card (spec 0006 `CaptureStage` output, unchanged in behavior), then a divider "o escribe" and the text field (spec 0006 AC-18). The inspector stays on the right on wide screens and moves below the column under 1024 px. A closed notebook shows spec 0005's closed state and no mic.
- **AC-2**: The mic button is 112 px across (88 px under 640 px), a circle. Idle: `brand` fill with a white mic icon, label "Hablar con LabFlow". Live: `surface` fill with a 2 px `brand` ring and a filled square icon, label "Parar". Starting: a spinner, `aria-disabled`. It keeps spec 0007's start, stop, and error behavior (AC-1, AC-10, AC-11). The hold mode switch (spec 0007 AC-8, task 5) is not built yet: the stage renders nothing for it until that task lands, then shows it under the mic.
- **AC-3**: The meter has 24 vertical bars, 4 px wide with 3 px gaps, centered above the mic, 56 px tall at most and 2 px at least, redrawn on each animation frame while live and never when idle. The pure `barHeights(input, mode, t)` in `web/src/lib/voice-meter.ts` computes them:
  - Listening, color `brand`: 12 bands spaced on a log scale from 80 Hz to 4 kHz over the bins of `getInputByteFrequencyData()` (bin width = sample rate / FFT size, from the analyser), each band's height = mean of its bins / 255 × 56 px; the 12 bands are mirrored around the center (lowest band in the middle) to make 24 bars.
  - Thinking (spec 0007 AC-24), color `ink-muted`: every bar at 8 px, plus a pulse centered at bar `p = (t mod 1200 ms) / 1200 × 24` raising bar `i` by `24 × max(0, 1 − |i − p| / 2)` px.
  - Speaking, `brand-soft` bars with a `brand` top edge: with `v = getOutputVolume()` (0 to 1) and center `c = 11.5`, bar `i` = `56 × v × (1 − 0.5 × |i − c| / c)` px.
  - Idle and stopped: a flat 1 px rule in `line`.
- **AC-4**: The state line under the mic (visual only; see AC-11 for what is announced) reads "Toca para hablar" (idle), "Conectando…" (starting), "Escuchando" (listening), "Pensando…" (thinking), "LabFlow responde" (speaking), followed by the elapsed time in `font-mono` ("0:12") while live.
- **AC-5**: Your words while you speak. When a `tentative_user_transcript` event arrives (spec 0007 AC-26, read through the hook's `onIncomingEvent`, field `tentative_user_transcription_event.user_transcript`), the transcript area shows its text in `ink` at 60 % opacity, replaced by each newer one; the final user transcript (`onMessage`, role `user`) replaces it in full `ink`. With no tentative events (older agent config), it shows "Escuchando…" until the final text. The text uses the heading font (`font-heading`, Geist today) at `text-2xl` (`text-xl` under 640 px), `aria-live="off"`; the final text is announced once in the polite region (spec 0007 AC-2).
- **AC-6**: LabFlow's reply. Each agent message (`onMessage`, role `agent`) shows under your words as "LabFlow: {text}" in `ink-muted`, `text-base`. A leading "A ver." (spec 0007 AC-22, which may arrive glued to the reply in one agent message) is removed before display; a message that is only the filler shows nothing. Each new user turn clears the previous pair; only the latest pair is on screen.
- **AC-7**: Stop feedback. The hook records why each session ended, at the call site: `button`, `silence`, `max_duration`, `hidden`, or `drop`. When a session ends, the meter flattens, the mic returns to idle, and one line stays under it until the next start: "Terminado · {elapsed} · {n} guardados" ("1 guardado", "nada guardado"); for `silence`, "Terminado por silencio · …". For `hidden`, the line shows without the count when the tab comes back ("Terminado · 0:48"), since the response may be lost. A `drop` keeps spec 0007 AC-11's error copy instead. The last words and reply stay visible.
- **AC-8**: The saved count comes from the server. Each voice turn records the ids of the proposals it saved (auto saves and voice confirms, including replacements, spec 0011 AC-4) on its `Spoken` result. `DELETE /api/voice/session/{sid}` ends the session, waits for the session's running turns to finish (at most `LLM_DEADLINE_S`), then returns 200 `{ "saved": n }`, where n counts those proposal ids whose status in the database is still `confirmed`, so any undo (voice or the text Deshacer) is subtracted. The browser sends exactly one DELETE per session and feeds its response to the summary. A 404 (session already ended) or a failed request shows the line without the count ("Terminado · 0:48").
- **AC-9**: Same component on `/`. The home page's mic (spec 0004, spec 0007 AC-1) uses this component in a centered single column, with "Dictando en {notebook}" under it as today. Both pages share one component and the `useVoiceSession` hook.
- **AC-10**: Reduced motion. With `prefers-reduced-motion: reduce`, the meter does not animate bar by bar: listening and speaking show one static bar row scaled to the current level, updated at most 4 times per second; thinking shows the bars at a fixed height with no traveling pulse, and the state line carries the meaning.
- **AC-11**: Accessibility and phone. The mic is a real `button` with `aria-pressed` while live, reachable by keyboard with a visible focus ring; the meter is `aria-hidden`; the existing polite region announces only the final user text, LabFlow's reply, the stop line, and errors (not every state change, which would be noisy each turn); text contrast meets WCAG AA in light and dark themes; vitest-axe reports no violations in idle, listening, thinking, speaking, stopped, and error; at 320 px there is no sideways scroll and the mic, words, and text field fit without overlap.
- **AC-12**: Typing stays the fallback. The text field below the divider works at all times (also while a voice session is live); on a voice error focus moves to it (spec 0007 AC-11).

## Decision

**Chosen option**: Option 1: Center stage, green instrument (see [rationale.md](rationale.md)).

One `VoiceStage` component replaces the small button and the hero mic: a bar meter fed by the SDK's levels, the live words and reply, and a server counted stop summary, drawn only with the existing tokens.

**Implementation skills**: `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `agents` (`elevenlabs/skills`, `.claude/skills/agents/`)

## Rationale

See [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no change. The saved count lives in memory on the session (`ActiveSession.turns`, spec 0007).

**State machine** (the stage, from `useVoiceSession`): `idle` → `starting` → `listening` ⇄ `thinking` → `speaking` → `listening` … → `stopped` (summary line) → `starting` on the next tap. Any live state → `error` on a drop or failed start.

**Components**:
| Component | Where | New or existing |
|---|---|---|
| `VoiceStage` | `web/src/components/voice/voice-stage.tsx` | new, replaces `VoiceConversation`'s markup (the provider wrapper stays) |
| `LevelMeter` | `web/src/components/voice/level-meter.tsx` | new: a canvas or 24 `div` bars driven by `requestAnimationFrame`; a pure `barHeights(levels, mode, t)` in `web/src/lib/voice-meter.ts` |
| `useVoiceSession` | `web/src/hooks/use-voice-session.ts` | existing: add `thinking` (spec 0007 AC-24), `tentative`, `summary`, and level getters |
| `CaptureStage` | existing | unchanged, rendered under the transcript area |
| Notebook page | `web/src/components/notebooks/notebook-view.tsx` | existing: new column order (AC-1) |

**API surface**:
| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/voice/session/{sid}` | DELETE | `sid` path | 200 `{ saved: int }` (was 204), after running turns finish (at most `LLM_DEADLINE_S`) | access session | 401, 404 `voice_session_not_found` |

`make openapi` after the change.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Meter, listening | 24 bar heights | `conversation.getInputByteFrequencyData()` bucketed into 24 bands by `barHeights` |
| Meter, speaking | bar heights | `conversation.getOutputVolume()` |
| Meter, thinking | pulse position | the animation frame time, no audio input |
| State line | state and elapsed time | `useVoiceSession().state` (spec 0007 AC-24 adds `thinking`); elapsed from the session start time already in the hook |
| Your words | tentative text | `tentative_user_transcript` event text (spec 0007 AC-26) |
| Your words | final text | `onMessage` role `user` (today's `heard`) |
| Reply | text | `onMessage` role `agent` (today's `answer`), minus the exact filler "A ver." |
| Stop line | elapsed | session start to end time, in the hook |
| Stop line | n guardados | `DELETE /api/voice/session/{sid}` response `saved`: the session's recorded saved proposal ids still `confirmed` in the database, after running turns finish |
| Stop line | "por silencio", count shown or not | the end reason the hook records at the call site (`button`, `silence`, `max_duration`, `hidden`, `drop`) |
| Colors | every color | existing tokens in `web/src/app/globals.css`: `brand`, `brand-soft`, `ink`, `ink-muted`, `line`, `surface`, `canvas` (light and dark) |

**Key invariants**:
- The meter reads levels only while a session is live and stops its animation frame loop otherwise.
- No new color, font, or gradient: only existing tokens; no glow, orb, or blur.
- The reply shown is the agent's spoken text, which is always our server's template text (spec 0006 AC-12).

**Security model**: unchanged. `DELETE /api/voice/session/{sid}` stays behind the access gate and only ends sessions of the same holder (spec 0007 AC-13).

**Critical test scenarios**:
- Happy path (mocked hook): idle → listening with tentative words → thinking → speaking with the reply → stop shows "Terminado · 0:12 · 1 guardado", verifies **AC-3** to **AC-8**
- No tentative events: "Escuchando…" until the final text, verifies **AC-5**
- Summary 404: the line shows no count, verifies **AC-8**
- Reduced motion: no per frame animation, verifies **AC-10**
- Axe in every state, 320 px layout, verifies **AC-11**
- API: DELETE returns `saved` counting an auto save and not counting an undone one, verifies **AC-8**

## Build plan

Skateboard: make the waiting visible first, then the live words, then the polish.

1. **Stage and states**: `VoiceStage` with the mic sizes, the state line, the notebook page order and the home page reuse; consumes `thinking` from spec 0007 task 9. Satisfies **AC-1**, **AC-2**, **AC-4**, **AC-9**, **AC-12**
2. **Meter**: `barHeights` (pure, unit tested), `LevelMeter` with the four looks and reduced motion. Satisfies **AC-3**, **AC-10**
3. **Words and reply**: tentative and final text, the reply line without the filler. Satisfies **AC-5**, **AC-6**
4. **Stop summary**: `Spoken` records saved proposal ids; DELETE waits for running turns and returns `saved` (API + `make openapi`); the hook sends one DELETE per session, records the end reason, and keeps the summary; the stop line. Satisfies **AC-7**, **AC-8**
5. **Accessibility and phone pass**: axe in every state, 320 px, keyboard, dark theme contrast. Satisfies **AC-11**

## Consequences

**Positive**:
- The wait between your words and the reply is visible, so nobody taps stop on a working turn.
- One component for both pages; the notebook page finally leads with voice.

**Negative / tradeoffs**:
- The notebook page's context and badges shrink to make room; long context is one click away instead of visible.
- An animation frame loop runs while live; cheap, but it needs care on low end phones (the meter stops when idle).
- `DELETE` changes from 204 to 200 with a body: a contract change for the web client.

**Neutral**:
- Tentative words depend on the agent config (spec 0007 AC-26); without it the stage still works with final text only.

## Follow-up

- [ ] Show the built stage to the engineer in light and dark before merging (the engineer's UI preference: approve the look before it ships).
