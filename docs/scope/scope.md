# Scope: LabFlow AI

A voice first lab notebook for chemical engineering students and research assistants. You dictate a measurement with your hands busy, confirm what LabFlow understood, and get a table, a chart, and answers about your data, with no invented numbers. Product source: [producto-y-requerimientos-v0.3.md](../product/producto-y-requerimientos-v0.3.md).

**Build approach:** Skateboard (ship the smallest usable notebook first, typed capture with confirmation, then grow it release by release: voice, chart and questions, warnings).
**Workflow:** Alpha (after `/develop`, run `/check verify` on the real app). The project default level of rigor. `/architect` is the recommended first stop for a feature with a real decision, but skippable when you already know the build. Any feature can carry its own tag (e.g. `· Beta`) to do more or less.

**MVP line (demo, Friday Oct 30):** Foundations plus Releases 1 to 4. Later slices start only once the MVP works end to end.

_These are recommendations to keep your build orderly, not requirements. Skip anything that does not fit: if you already know how to build a feature, use `/develop` and skip `/architect`. You decide when a feature is `done`._

## At a glance

| # | Feature | Phase | Status |
|---|---------|-------|--------|
| 1 | Stack & architecture | Foundation | done |
| 2 | Coding standards & tooling | Foundation | done |
| 3 | Data model | Foundation | in-progress |
| 4 | Design system & UI foundation | Foundation | in-progress |
| 5 | Experiments: create and list | Release 1 | planned |
| 6 | Text capture and confirm card | Release 1 | planned |
| 7 | Trials table | Release 1 | planned |
| 8 | Voice capture | Release 2 | planned |
| 9 | Chart: X against Y | Release 3 | planned |
| 10 | Questions about the data | Release 3 | planned |
| 11 | Range and unit warnings | Release 4 | planned |
| 12 | Extraction evaluation set | Release 4 | planned |
| 13 | Spoken replies | Later | planned |
| 14 | Edit and delete saved trials | Later | planned |
| 15 | Pending measurements check | Later | planned |
| 16 | CSV export | Later | planned |
| 17 | Protocol PDF questions | Later | planned |
| 18 | Draft report | Later | planned |
| 19 | Access code gate | Foundation | planned |

## Foundations

### 1. Stack & architecture · Beta · done
Choose the web front end, the backend API, storage, and where the AI calls live (API keys stay on the server), then scaffold a project that runs. Your doc lists SQLite vs Supabase and FastAPI vs Node as open calls.
**Done when:** the stack is recorded in a spec, and the empty scaffold boots locally with front end talking to the backend.
spec [0001](../specs/0001-stack-architecture/index.md) · code in `web/`, `api/`
- [x] Decide the stack (spec): `/architect stack & architecture`
- [x] Scaffold from the decision: `/develop stack & architecture`
- [x] Verify it: `/check verify stack & architecture`
- [ ] Test it: `/test stack & architecture`

### 2. Coding standards & tooling · done
Capture conventions and tooling from the real scaffold, then install lint, format, and pre commit checks.
**Done when:** root `AGENTS.md` reflects the real stack, and lint and format run clean.
code in `lefthook.yml`, `.github/workflows/ci.yml`, `Makefile`, `api/pyproject.toml`, `web/eslint.config.mjs`
- [x] Capture conventions + tooling choices: `/audit`
- [x] Install the tooling: `/develop tooling`

### 3. Data model · in-progress
Experiment, Variable, Trial, Measurement, with every measurement keeping its original phrase, source (voice or text), time, and state (proposed or confirmed). Protocol comes later.
**Done when:** a proposal can exist without appearing in the table, confirming it makes it a saved measurement, and later releases (ranges, edits, protocol) fit without a breaking change.
spec [0002](../specs/0002-data-model/index.md) · code in `api/app/models/`, `api/app/repositories/`, `api/app/services/`, `api/migrations/`, `api/scripts/seed.py`
- [x] Design it (spec): `/architect data model`
- [x] Build it: `/develop data model`
  - [x] Database connection, seven tables, and the hand checked migration with RLS (AC-1, AC-11, AC-12, AC-15)
  - [x] Proposal lifecycle and conversation turns: start, set value, confirm, discard, last turns (AC-2 to AC-10, AC-14)
  - [x] Seed the sample experiment with `make seed` and run it against the dev database (AC-13)
- [x] Verify it: `/check verify data model`

### 4. Design system & UI foundation · in-progress
A small visual language and base pieces: layout, buttons, form fields, the proposal card, an always visible mic state. The proposal card is the star of the demo.
**Done when:** `design.md` covers type, color, spacing, and the card; base components work by keyboard and show focus.
spec [0003](../specs/0003-design-system-ui-foundation/index.md) · code in `web/src/components/`, `web/src/app/globals.css`, `web/src/app/dev/ui/`, `web/design.md`
- [x] Design it (spec): `/architect design system & UI foundation`
- [x] Build it: `/develop design system & UI foundation`
  - [x] Test setup, tokens, fonts, contrast and raw color tests, first `web/design.md` (AC-1 to AC-4, AC-6)
  - [x] Base components, number formatting, app shell, workspace layout, home page, manifest (AC-5, AC-7, AC-13, AC-14, AC-17, AC-18)
  - [x] Proposal card and mic dock in every state (AC-8 to AC-12)
  - [x] Motion, the card to table flight, `/dev/ui`, finished `web/design.md` (AC-2, AC-15, AC-16)
- [ ] Verify it: `/check verify design system & UI foundation`

### 19. Access code gate · from spec 0002
The personal access code gate already designed in spec 0001: `POST /api/access`, the signed `labflow_session` cookie, the FastAPI dependency that returns 401, and the Next.js redirect to `/access`. Feature 5 needs its holder name for `experiment.created_by`.
**Done when:** without a valid code every route except `/api/health` and `/api/access` returns 401, the web app redirects to `/access`, and a valid code lets you in with your holder name available to routes.
spec [0001](../specs/0001-stack-architecture/index.md)
- [ ] Build it: `/develop access code gate`
- [ ] Verify it: `/check verify access code gate`

## Release 1: Typed notebook (smallest usable whole)

### 5. Experiments: create and list · needs a decision
Screens P1 and P2: list your experiments, create one with a title, goal, and variables (name, unit, optional range, required or not). RF-01, RF-02.
**Done when:** you can create the sample experiment with 3 variables, see it in the list, reload the page, and open it again with everything intact (PA-01, PA-08).
- [ ] Design it (spec): `/architect experiments create and list`

### 6. Text capture and confirm card · needs a decision · Beta
The heart of LabFlow. You type a sentence, the AI turns it into trial, variable, value, unit, and shows a card asking "¿Lo guardo?". You confirm, edit a field, or discard. It asks instead of guessing when something is missing or ambiguous. This spec also decides the AI model, the output schema, and the intent and tool pattern that later features reuse. RF-04, RF-05, RF-06, RF-07, RN-01 to RN-03.
**Done when:** nothing reaches the table before you confirm; a correction replaces the value with no duplicate; "Ensayo 6, 65 grados" makes it ask for the missing values; dictating a trial number that exists asks whether it is a correction; "grados" becomes °C and "por ciento" becomes % (PA-03, PA-04, PA-09).
- [ ] Design it (spec): `/architect text capture and confirm card`

### 7. Trials table
The table of confirmed trials in the workspace (P3), updating the moment you confirm. RF-09.
**Done when:** the table matches exactly what is saved, and refreshes right after each confirmation.
- [ ] Build it: `/develop trials table`

## Release 2: Hands free

### 8. Voice capture · needs a decision
A mic button with a visible state; your dictation in Spanish (numbers in words, "coma" decimals) becomes the same proposal as typed text, and you can correct by voice ("No, el rendimiento es setenta y tres"). Decides the voice integration (an all in one voice agent platform vs speech to text plus your own agent). No audio stored. RF-03, RF-06, RNF-01, RNF-02, RNF-09.
**Done when:** a full dictation shows a proposal in 5 s or less; a spoken correction updates the card; if the voice service fails, typing still works (PA-02).
- [ ] Design it (spec): `/architect voice capture`

## Release 3: Understand your data

### 9. Chart: X against Y · needs a decision
Plot any variable against another, picked with axis selectors or asked for in words ("muéstrame rendimiento contra temperatura"). Points come from code, never from the AI. RF-10.
**Done when:** the chart points match the table, and both the selector and the spoken request work (PA-05).
- [ ] Design it (spec): `/architect chart x against y`

### 10. Questions about the data · needs a decision · Beta
Ask for max, min, average, count, or a trial's value; deterministic code computes the answer and the reply names the trial it came from. RF-11, RN-04, RNF-04.
**Done when:** "¿Cuál fue el mayor rendimiento?" answers 80 %, trial 4, 55 °C; asking about trial 9 says there is no record; zero invented numbers on the trap questions (PA-06, PA-07).
- [ ] Design it (spec): `/architect questions about the data`

## Release 4: Trust and proof (completes the MVP)

### 11. Range and unit warnings
Before saving, warn when a value falls outside the variable's range or its unit does not fit. Extends the confirm card and the ranges already in the data model. RF-12.
**Done when:** "Temperatura 500 grados" on a 20 to 100 °C variable shows a warning on the card before saving.
- [ ] Build it: `/develop range and unit warnings`

### 12. Extraction evaluation set · needs a decision
30 to 50 labeled sentences (standard, numbers in words, reordered, incomplete, correction, ambiguous, out of range, trap questions) and a script that scores field accuracy, clarification rate, invented numbers, and latency. It feeds the model choice and the model card on Friday. RNF-02, RNF-03, RNF-04.
**Done when:** one command runs the set and reports field accuracy (target 90 % or more), zero invented numbers, and average latency.
- [ ] Design it (spec): `/architect extraction evaluation set`

## Later: after the MVP demo works

### 13. Spoken replies · needs a decision
LabFlow reads the confirmation and short answers aloud, so you never need to look at the screen.
**Done when:** the confirm card and data answers are spoken in natural Spanish without slowing the 5 s proposal target.
- [ ] Design it (spec): `/architect spoken replies`

### 14. Edit and delete saved trials
Fix or remove a trial already saved; the change shows in table and chart with its edit time. RF-08.
**Done when:** an edit or delete is reflected in table and chart, and the edit time is recorded.
- [ ] Build it: `/develop edit and delete saved trials`

### 15. Pending measurements check
When you say "terminar", list trials with required variables still empty. RF-13.
**Done when:** finishing an experiment with gaps lists each trial and missing variable before closing.
- [ ] Build it: `/develop pending measurements check`

### 16. CSV export
Download the trials table as a CSV. RF-15.
**Done when:** the file opens in Excel with the same rows and columns as the table.
- [ ] Build it: `/develop csv export`

### 17. Protocol PDF questions · needs a decision
Upload the lab protocol PDF (P4) and ask about the procedure; answers cite the passage used, and say so when the answer is not there. RF-14.
**Done when:** an answer quotes the passage it used, and a question the PDF does not cover gets "no está en el protocolo".
- [ ] Design it (spec): `/architect protocol pdf questions`

### 18. Draft report · needs a decision
A downloadable preliminary report (P5) clearly marked as an AI draft that needs human review. RF-16.
**Done when:** the report includes the table, chart, and summary, every number traces to saved data, and the AI draft label is visible.
- [ ] Design it (spec): `/architect draft report`

## Deferred
Out of scope for this project, kept so the plan stays honest.
- **Accounts and collaboration**: sign in, several users per experiment, permissions · needs a decision
- **Quality monitoring**: track % of proposals corrected, clarification rate, latency over time (ML Canvas monitoring) · needs a decision
- **Instrument integration**: read values straight from lab equipment · needs a decision
- **Cross experiment comparison and guided protocols**: the future vision · needs a decision

## Legend

**The decision box.** Every feature carries exactly one, the sub task whose label ends with `(spec)`. Its wording varies (`Design it (spec)` normally, `Decide the stack (spec)` on Stack & architecture), so skills locate it by that `(spec)` suffix, never by an exact label. Every other box is an execution box and `/architect` never ticks one.

**Feature lifecycle**: the scope updates as a feature moves; each row is what it shows and who sets it:

| State | Set by | The feature shows |
|---|---|---|
| `planned` · needs a decision | `/scope` | one box: `Design it (spec): /architect <feature>` |
| `in-progress` (designed) | **`/architect` at spec capture** | `Design it` ticked; spec linked; `Build it: /develop <feature>` + **2 to 5 milestones**; the tier's closing boxes (`Verify it` Alpha+, `Test it` Beta+, `Review it` + `Document it` GA); any surfaced follow up enrolled |
| `in-progress` (building) | `/develop` | milestone sub boxes tick one by one; code pointer filled |
| `in-progress` (verified) | `/check verify` | `Build it` + milestones ticked; `Verify it` ticked |
| `done` | **you, when you decide it is** (any skill sets it when you say so); `/sync` reconciles | boxes you ran ticked, skipped ones marked skipped; the tier's last stage (`Prototype` → after `/develop`; `Alpha` → after `/check verify`; `Beta`/`GA` → after `/test`) is the suggested point to call it done; `/sync` captures conventions |

- **Next step** = the first unticked box (always a command or a tracked milestone).
- **needs a decision** = run `/architect` first; otherwise straight to `/develop` (or `/audit` for standards & tooling). The tag drops once the spec is captured.
- **Atomic build tasks live in the spec's `## Build plan`, not here**: the scope carries only the milestone rollup.
- **Status** `planned` → `in-progress` → `done`, plus `existing` (pre workflow) and `dropped` (de scoped, kept for history).
- **Approach tag** beside a heading (e.g. `· Facade`) overrides the project default for that feature; no tag = inherits it.
- **Workflow tier tag** beside a heading (e.g. `· Beta`) sets that one feature's rigor above or below the project default; no tag inherits the default. It decides the feature's check boxes and each skill's next suggestion.
- **Workflow** (header line) is the project default, what runs after `/develop`: **Prototype** = nothing (trust develop's own build time self check); **Alpha** = `/check verify`; **Beta** = `/check verify` then `/test`; **GA** = adds a fresh model `/check review` then `/document`. A feature built on an unratified decision (an `Assumed` spec) stays flagged, but that never blocks `done`.
- **Pointer line** (`spec <n> · code in <path>`): the spec link added by `/architect`, the code path by `/develop`.
