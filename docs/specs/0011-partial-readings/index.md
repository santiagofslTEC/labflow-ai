# 0011. Partial readings: save what was said, one or two values at a time

**Date**: 2026-10-30
**Status**: In Progress

Supersedes, in spec 0006: AC-5 (missing values asked), AC-7 (repeated trial asks "corregir o es otro") for sentences, the `pending_other_trial` part of AC-8 when the new reading is clean, AC-17's list of state reasons (AC-15 here), AC-25 and AC-35 where they say the card then asks for what is still missing, AC-27's clean rule, and AC-29's undo when a card is pending. Supersedes, in spec 0007: the "every required value present" part of AC-5, the `missing_values` and `choose_trial` questions in AC-6, and the undo rules of AC-7 and AC-14 (AC-10 and AC-13 here). Everything else in 0006 and 0007 stays in force. The `ElegirEnsayo` tool and `POST /api/proposals/{id}/trial` stay only for cards created before this change.

## Summary

An experiment watches a few variables change over time, so a student says one or two values at a time: "ensayo 3, temperatura 65 grados". Today LabFlow holds that back and asks for every other variable before it saves. From now on it saves exactly what was said, never asks for the rest, and lets later sentences add to the same trial. It still asks before it would replace a value that is already saved, and when a value is out of range or unclear. "Required" on a variable now only means "expected in a complete trial"; it never blocks a save or starts a question.

## Requirements

**User stories**:
- As a student watching a reaction, I want to say only the value that just changed, so that I record it the moment I read it.
- As a student, I want later sentences to add to the same trial, so that one trial fills up over time without dictating it again.
- As a student, I want LabFlow to ask before it replaces a value I already saved, so that a slip of the tongue never erases real data.

**Acceptance criteria**:
- **AC-1**: Partial save. On a notebook with temperatura, presión, and rendimiento, and trial 3 not saved yet, "ensayo 3, temperatura 65 grados" saves trial 3 with temperatura 65 °C in the same turn, with no card and no question about presión or rendimiento. Only one `measurement` row is written. Text shows spec 0006's saved notice ("Guardado ensayo 3 · 65 °C · Deshacer"); voice says "Guardado ensayo 3: 65 °C. Di deshacer para quitarlo." (`auto_saved_aloud`).
- **AC-2**: What required means. `variable.required` never makes LabFlow ask, never blocks an auto save, and never blocks a confirm. The planner never produces `missing_values` for a card that holds at least one value. The column stays; the variables dialog (spec 0008) labels it "Esperada" instead of "Requerida" (and "Opcional" stays), with the hint "Se espera en cada ensayo. Nunca bloquea un guardado."
- **AC-3**: Adding to a saved trial. With trial 3 saved holding only temperatura, "ensayo 3, presión 2" saves presión 2 on the same trial row (no new trial, no `choose_trial` question), in the same turn, with undo. This holds for any saved trial number, not only the remembered trial. The planner no longer produces `choose_trial` for a sentence; a sentence naming a saved trial number always targets that trial.
- **AC-4**: Replacing asks first. With temperatura 65 saved on trial 3, "ensayo 3, temperatura 68" saves nothing and shows a correction card for trial 3 holding 68, with the new reason `confirm_change`: "¿Cambio temperatura del ensayo 3 de 65 a 68 °C?" (several values: "¿Cambio temperatura de 65 a 68 °C y presión de 2 a 3 bar en el ensayo 3?"). The button follows spec 0006 AC-22 ("Reemplazar 65 °C por 68 °C"). "sí" or the button replaces the value through spec 0002's `confirm` (no duplicate row); "no" or "descártalo" discards the card.
- **AC-5**: A split sentence. With temperatura 65 saved on trial 3, "ensayo 3, presión 2, temperatura 68" saves presión 2 now (auto saved, undoable) and leaves one pending correction card for trial 3 holding only temperatura 68 with the AC-4 question. The reply joins both: "Guardado ensayo 3: 2 bar. ¿Cambio temperatura de 65 a 68 °C?" The text screen shows the saved notice and the card together.
- **AC-6**: The general split rule. A value that needs any question waits on the card: it would replace a saved value (AC-4), or it is flagged (`out_of_range`, `converted`, `code_match`, spec 0006 AC-23). Flags apply to every value that fills an empty slot, also on a card that targets a saved trial; only a value that replaces a filled slot skips flags (its "¿Cambio…?" is already its extra step). Every other value in the sentence saves in the same turn. Only one card is ever pending (the database allows one per notebook). The waiting card always targets its trial: the trial the saved half just wrote, or the saved trial the sentence named. When the sentence left a number unplaced (`two_values`, `ambiguous_variable`, `unknown_unit`, `unclear_number`), that number is not on any card: the clean values save, the trial becomes an empty selection (AC-8, targeted), and the question lives only in that turn's reply (spec 0006 AC-17). The answer turns of spec 0006 AC-25 and AC-35 ("71", "sí") fill the waiting card or the empty selection, and a value they set saves at once when it is clean. When nothing in the sentence can save, behavior is spec 0006's card.
- **AC-7**: No trial number. "temperatura 66" with no number goes to the remembered trial (spec 0006 AC-31): the pending empty selection of AC-8 if there is one, else the trial of the notebook's latest saved proposal. Empty slots save at once (AC-3); a filled slot asks (AC-4). The reply names the trial ("Guardado ensayo 3: 66 °C."). With no remembered trial (nothing saved or selected yet), it asks "¿Qué número de ensayo es?" as spec 0006 AC-6 does.
- **AC-8**: Saying only a trial. Code, before the model (like spec 0006 AC-25's short answers), reads a sentence that is only a trial word and a number (spec 0006 AC-32 spellings, optional filler words) as a bare trial. "ensayo 4" with no card pending leaves a pending proposal for trial 4 with no values (targeting trial 4 when it is saved), writes no `trial` or `measurement` row, and replies with the new reason `trial_selected`: "Ensayo 4. Dime los valores." The next sentence without a number adds its values to that proposal and saves them by AC-1, AC-3, and AC-6. Another bare trial ("ensayo 5") replaces the empty selection with no question. With a card holding values waiting for another trial, a bare trial replies `pending_other_trial` (spec 0006 AC-8); for the same trial, it repeats the waiting card's question. The text screen shows it as a quiet line "Ensayo 4 · esperando valores", not a card with a save button.
- **AC-9**: Another trial while a card waits. A sentence about another trial whose values are all clean saves them (its own auto saved proposal) and leaves the waiting card as it is; the reply adds the waiting question once: "Guardado ensayo 4: 66 °C. Sigue pendiente: ¿Cambio temperatura del ensayo 3 de 65 a 68 °C?" When any value of the new trial's sentence needs a question, nothing from that sentence saves and spec 0006 AC-8 (`pending_other_trial`) applies unchanged (by voice, spec 0007 AC-6: the sentence is not kept). An empty selection (AC-8) is never "pending" for this rule: a sentence for another trial simply replaces it.
- **AC-10**: Undo takes back the last save. An auto save is undoable when it replaced no value (true for every auto save under AC-12, including additions to a saved trial) and no user turn came after the turn that saved it (this replaces spec 0007 AC-7's 300 s window and its "no correction target" rule). Undo deletes the `measurement` rows that save wrote, and the `trial` row only when that save created it, so undoing an AC-3 addition leaves trial 3 with its earlier values. Then:
  - Text "Deshacer" with no card pending: the values reopen as a pending card (spec 0006 AC-29).
  - Text "Deshacer" with a waiting card for the same trial (AC-5): the undone values join that card (still one pending card) and the auto saved proposal becomes `superseded`.
  - With a waiting card for another trial (AC-9): no card reopens; the auto saved proposal becomes `discarded`, the reply is "Deshecho: ensayo 4.", and the waiting card stays as it is.
  - Voice "deshacer" (spec 0007 AC-7): after a turn that saved, it undoes that save (even when the same turn left a waiting card), then discards the reopened values instead of reopening them, as built. With no save to undo and a card pending, it discards the card as before.
- **AC-11**: Trials table and export. A trial with only some values shows "—" in each empty cell, with no "incomplete" marker or warning (spec 0010). The CSV export leaves those fields empty. The trial count counts trials with at least one saved value. The results page (spec 0009) already skips missing values and does not change.
- **AC-12**: The clean rule (replaces spec 0006 AC-27 and spec 0007 AC-5's list). Code finds a set of values clean, so it may save with no tap, when the card has a trial number, the values are at least one, each value fills a slot that is empty on its trial (on a new trial every slot is empty), and none is flagged or unclear. Required variables play no part. The model's confidence plays no part. The slot test is enforced again at write time: an auto save only inserts `measurement` rows (`ON CONFLICT (trial_id, variable_id) DO NOTHING`, inside the turn's transaction); a value whose slot was filled in between (another tab, an overlapping voice turn) is not written and moves to the `confirm_change` card instead. A trial number created in between turns the save into an addition to that trial, not an error.
- **AC-13**: Voice is the same turn. Voice calls the same turn service (spec 0007 AC-3), so AC-1 to AC-10 hold by voice, with the spoken texts above. The joined replies come from two new templates in `replies.py`, each with a text and a spoken form: `split_saved` (AC-5: "Guardado ensayo 3: 2 bar. ¿Cambio temperatura de 65 a 68 °C?"; spoken the same, with no "Di deshacer" hint) and `saved_still_pending` (AC-9). `routers/voice.py` speaks the turn's full reply when a card is left waiting, not only `auto_saved_aloud`. A superseded voice turn (spec 0007 AC-14) is taken back in full: the newer request first undoes the older turn's auto save (AC-10, voice), then discards a card or empty selection the older turn created, then runs its own sentence. Each turn records the proposal ids it saved and created for this.
- **AC-14**: Traceability is unchanged. Every saved row still records `saved_by`, `confirmed_at`, `original_phrase`, `said_text`, `turn_id`, and `auto_saved` (spec 0006 AC-30), including each half of a split.
- **AC-15**: Reload. `GET /api/experiments/{id}/proposal` works out `trial_selected` and `confirm_change` from saved state like the other state reasons (spec 0006 AC-17), in this order: `missing_trial`, `trial_selected` (a number and no values), `check_values`, `confirm_change` (a value replaces a saved one; the text names the old values read from the target trial), `ready`. `missing_values` and `choose_trial` are no longer produced.
- **AC-16**: The waiting sentence (spec 0006 AC-8) is sent again by the browser only when a response reports `saved` or `discarded` and no `proposal` is pending, so a split response (AC-5) does not resend it.

## Decision

**Chosen option**: Option 2: Split the sentence; clean values save, values with a question wait (see [rationale.md](rationale.md)).

Code, not the model, splits each sentence into values that save now and values that wait on one card, using the trial's saved slots as the only test of "new" versus "replace". No schema change.

**Implementation skills**: `fastapi` (`fastapi/fastapi`, `.claude/skills/fastapi/`) · `sqlmodel` (`fastapi/sqlmodel`, `.claude/skills/sqlmodel/`)

## Rationale

See [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no schema change. `variable.required` stays (meaning changes, AC-2). `proposal` keeps its statuses (`pending`, `confirmed`, `discarded`, `superseded`) and the partial unique index `uq_proposal_experiment_pending` (one `pending` proposal per experiment). The saved half of a turn never passes through `pending`: a new `proposals.save_now(...)` inserts it directly as `confirmed` with its `proposal_value` and `measurement` rows. When the clean values were already on the pending card (an answer turn, AC-6; a no number sentence, AC-7), they move off it (their `proposal_value` rows deleted, the card's `updated_at` bumped) into the `save_now` proposal. The whole split (save now, then create or update the waiting card) runs in one database transaction; today `start_proposal` and `confirm` each commit, so the executor gains one transactional path for it. An empty selection (AC-8) is a `pending` proposal with `trial_number` set (and `target_trial_id` when that trial is saved) and no `proposal_value` rows. Every place the planner sets a trial number that is already saved also sets the target: `StartProposal`, the trial branch of the measurement operations, the `missing_trial` short answer, and `ElegirEnsayo`.

**State transitions** (proposal): created `confirmed` (`save_now`, an auto save) · created `pending` (a card or empty selection) · `pending` → `confirmed` (confirm) · `pending` → `discarded` · `pending` → `superseded` (a newer selection, AC-8) · `confirmed` → `pending` (text undo with no card waiting, spec 0006 AC-29) · `confirmed` → `superseded` (undo merged into a waiting card) · `confirmed` → `discarded` (undo with another trial's card waiting, and voice undo).

**API surface**: no new route. Changed behavior only:

| Endpoint | Method | Change |
|---|---|---|
| `/api/experiments/{id}/utterances` | POST | `TurnResponse` may carry both `saved` (the auto save) and `proposal` (the waiting card) in one turn (AC-5, AC-9); new reply reasons `confirm_change`, `trial_selected` |
| `/api/experiments/{id}/proposal` | GET | an empty selection returns its proposal with `values` all null and `question.reason = trial_selected` (AC-8) |
| `/api/proposals/{id}/undo` | POST | merges into a waiting card when one exists (AC-10) |
| `/api/proposals/{id}/trial` | POST | kept for cards created before this change; the planner no longer produces `choose_trial` (AC-3) |
| `/api/voice/llm/chat/completions` | POST | speaks the joined reply of AC-5 and AC-9 |

`make openapi` regenerates the contract for the new reason values.

**Value sourcing**:
| Action | Value produced / displayed | Source |
|---|---|---|
| Split a sentence (AC-5, AC-6) | which values save now | each value's slot on its trial: empty when the trial has no `measurement` for that variable. `load_context` runs before the model, so it loads `saved: Mapping[trial_number, Mapping[variable_id, float]]` for every trial of the notebook in its single pass (notebooks are small); it replaces `RememberedTrial.filled` · flags from `services/flags.py`, skipped only for values replacing a filled slot · sentence reasons from the planner · re-checked at write by insert only (AC-12) |
| Replace question (AC-4) | "de 65 a 68" | old value: the trial's `measurement.value`; new value: the grounded `proposal_value.value` |
| No number (AC-7) | the trial | the pending empty selection's `trial_number`, else the latest saved proposal's trial (spec 0006 AC-31 query) |
| Bare trial (AC-8) | "Ensayo 4" | the trial number read by code after a trial word (spec 0006 AC-32) |
| Joined reply (AC-5, AC-9) | both texts | new `replies.py` templates `split_saved` and `saved_still_pending` (text and spoken forms), built from the saved values and the waiting card's reason text |
| Undo (AC-10) | which branch | whether a card is pending and its `trial_number` versus the undone save's trial |
| Superseded voice turn (AC-13) | what to take back | the proposal ids the older turn recorded on its `Spoken` result (saved and created) |
| Reload (AC-15) | old values in "de 65 a 68" | the target trial's `measurement.value` |
| Table "—" (AC-11) | empty cell | absence of a `measurement` row for that trial and variable (spec 0010 query) |
| Trial count (AC-11) | n | trials with at least one `measurement` |
| "Esperada" label (AC-2) | label | `variable.required` |

**Key invariants**:
- At most one `pending` proposal per experiment (database index).
- A saved value is never replaced without the student's "sí" or button (AC-4), also under races (insert only auto saves, AC-12).
- Every value saved without a tap passes AC-12; required variables never block.
- An empty selection never writes a `trial` or `measurement` row.
- Every user facing text comes from `replies.py` templates (spec 0006 AC-12).

**Security model**: unchanged. The same access session and holder (`saved_by`) as spec 0006; voice keeps spec 0007 AC-13.

**Critical test scenarios**:
- Happy path: "ensayo 3, temperatura 65" saves one row; "ensayo 3, presión 2" adds to the same trial; the table shows "—" for rendimiento, verifies **AC-1**, **AC-3**, **AC-11**
- Split: "ensayo 3, presión 2, temperatura 68" saves presión and leaves one card asking the change; "sí" replaces 65 with 68 with no duplicate row, verifies **AC-4**, **AC-5**
- Undo of a split: undo merges presión 2 into the waiting card; still one pending proposal; trial 3 keeps temperatura 65, verifies **AC-10**
- Bare trial then value: "ensayo 4" then "temperatura 66" saves on trial 4; no trial row exists in between, verifies **AC-7**, **AC-8**
- Flagged half: "ensayo 5, temperatura 650, presión 2" saves presión and the card asks about 650, verifies **AC-6**
- Required never asks: a notebook with every variable required saves a one value sentence with no question, verifies **AC-2**, **AC-12**
- Race: the slot fills between plan and write; the auto save writes nothing for it and the card asks the change, verifies **AC-12**
- Undo with another trial waiting: trial 4's save is undone and card 3 stays, verifies **AC-10**
- Superseded voice turn: "ensayo 1 temperatura 650" superseded by "ensayo 13 temperatura 65" leaves no stale card, verifies **AC-13**
- Reload: a `confirm_change` card and an empty selection come back from GET with their texts, verifies **AC-15**
- Voice: the same sentences through the Custom LLM speak the joined replies, verifies **AC-13**

## Build plan

Skateboard order: the smallest change that makes one value save first, then the rest of the rules.

1. **Context and clean rule**: `load_context` loads every trial's saved values; rewrite `card_state.is_clean` to AC-12 (slots of the named trial, no required check); flags skipped only for replacing values; `card_reason` per AC-15. Satisfies **AC-1**, **AC-2** (API side), **AC-12**, **AC-15**
2. **Targets everywhere and add to a saved trial**: set the target wherever a saved trial number is set; retire `choose_trial` from the planner (route and tool kept for old cards). Satisfies **AC-3**
3. **`save_now`, the split, and insert only writes**: one transactional executor path; moving clean values off a pending card; `confirm_change`; the `split_saved` and `saved_still_pending` templates; `TurnResponse` carries both. Satisfies **AC-4**, **AC-5**, **AC-6**, **AC-12**, **AC-14**
4. **Remembered and bare trial**: code detection of a bare trial, the empty selection, AC-7 lookup order, AC-9 other trial behavior. Satisfies **AC-7**, **AC-8**, **AC-9**
5. **Undo and superseded voice turns**: the AC-10 branches; `Spoken` records saved and created proposal ids; the newer request takes back both; `routers/voice.py` speaks the joined reply. Satisfies **AC-10**, **AC-13**
6. **Web**: `make openapi`; the card and notice together (AC-5); the "Ensayo 4 · esperando valores" line; the resend rule; "Esperada" label and hint; table "—" cells and trial count check. Satisfies **AC-2**, **AC-5**, **AC-8**, **AC-11**, **AC-16**
7. **Voice check**: the spoken texts for AC-1, AC-5, AC-8, AC-9 through `voice_probe.py` on a scratch notebook (spec 0007 AC-25). Satisfies **AC-13**

## Consequences

**Positive**:
- One value at a time works, by text and by voice, with no forced questions.
- Fewer turns per trial; voice gets much shorter.
- No migration: the change lives in the pure planner and the executor.

**Negative / tradeoffs**:
- A trial can stay incomplete forever with no warning; the table's "—" is the only hint (the engineer chose this over a "faltan N" marker).
- Retiring `choose_trial` means a student who reuses a saved number for a new run fills that trial's empty slots silently; only colliding values ask.
- A split turn writes two proposals and returns two things to show; the web and voice replies get a little more complex.
- Spec 0006 tests that expect `missing_values` and `choose_trial` for sentences must change.

**Neutral**:
- `variable.required` keeps its column but changes meaning; spec 0008's dialog copy changes.
- The trial number of an empty selection lives on a pending proposal, so a reload still shows "Ensayo 4 · esperando valores".

## Follow-up

- [ ] Update the tests for spec 0006's AC-5, AC-7, AC-8, AC-17, AC-22, AC-25, AC-27, AC-29, AC-35 and spec 0007's AC-2, AC-5, AC-6, AC-7, AC-14 to this spec as tasks 1 to 5 land.
- [ ] Update feature 6's "Done when" in `docs/scope/scope.md` ("'Ensayo 6, 65 grados' makes it ask for the missing values" no longer holds).
- [ ] Later, if students ask for it: a "faltan N" marker per trial using `required` (declined for now, AC-11).
