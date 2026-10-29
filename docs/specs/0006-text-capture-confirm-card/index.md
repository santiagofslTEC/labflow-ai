# 0006. Text capture and the confirm card

**Date**: 2026-10-28
**Status**: In Progress

## Summary

You type a sentence like "Ensayo 6, 65 grados, 20 minutos, 74 por ciento" and LabFlow shows a card asking "¿Lo guardo?". The AI only picks what to do (a tool) and points at the words it read; plain Python code checks that every number really appears in your sentence, converts the units, decides what to ask when something is missing, and writes every reply from fixed Spanish templates. Nothing is saved until you confirm, through the proposal lifecycle that spec 0002 already built. This feature ships the API routes, the AI providers (Ollama first, Claude as fallback), the web hooks, and one `CaptureStage` component that feature 20 drops into the main page.

Amended after the pitch feedback (confirmation fatigue): the card shows what you said next to what LabFlow understood ("setenta y tres por ciento" → 73 %), and those exact words are stored with each value. The button names what it saves ("Guardar 73 %"). A plain card saves in one tap; a card with something worth a second look (a converted unit, a number found by code only, or a value out of range) is drawn differently and asks you to tap each marked value before it saves.

## Requirements

**User stories**:
- As a student, I want to type a measurement in my own words and see what LabFlow understood before anything is saved, so that a misread number never reaches my table.
- As a student, I want LabFlow to ask when I leave something out or say something unclear, so that it never guesses a trial or a value for me.
- As a student, I want to fix a value by saying "No, el rendimiento es 73" or by editing the card, so that the card ends right with no duplicates.
- As a student, I want to dictate a trial in pieces, so that I can say each value as I read it.
- As a team, we want every number on the card to come from the user's own words, so that we can claim zero invented numbers at the demo.
- As a student, I want to see the words I said next to the number LabFlow understood, and a button that names what it saves, so that I check the value instead of tapping yes out of habit.
- As a student, I want LabFlow to interrupt me only when something looks off, so that a plain reading saves in one tap and a suspicious one makes me look.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: On the seeded experiment, `POST /api/experiments/{id}/utterances` with "Ensayo 6: temperatura 65 grados, duración 20 minutos, rendimiento 74 por ciento" returns 200 with a pending proposal for trial 6 holding 65 °C, 20 min, and 74 %, each with that sentence as its phrase and `source = text`. A user turn and an assistant turn are stored. The `measurement` table is unchanged.
- **AC-2**: Confirming (the card's button, `POST /api/proposals/{id}/confirm`, or typing "sí, guárdalo" while a card is pending) saves the trial through spec 0002's `confirm` and returns `saved` with the trial id, number, and whether it was new. Confirming again returns the same trial. "Sí" with no pending card replies `no_pending` and saves nothing.
- **AC-3**: Dictating in parts (RN-03): with a card for trial 6 pending, "rendimiento 74" adds the value to the same card. A turn never creates a second card while one is pending (see AC-8 for a different trial number).
- **AC-4**: Correcting before saving (RF-06): "No, el rendimiento es setenta y tres" replaces the value on the pending card, leaving one value per variable. Editing a value on the card by hand (`PUT /api/proposals/{id}/values/{variable_id}`) replaces it without calling the AI, and stores a user turn "Editado: {name} {value} {unit}" with `source = text` as that value's phrase.
- **AC-5**: Missing values (RF-07): "Ensayo 6, 65 grados" gives a card with 65 °C and empty slots, and the question asks for the required variables still empty ("Me falta duración y rendimiento. ¿Cuánto fueron?"). Confirm is still allowed and saves a partial trial (spec 0002, AC-9).
- **AC-6**: Missing trial number: "temperatura 50 grados" with no card pending gives a card with no trial number and the question "¿Qué número de ensayo es?". `can_confirm` is false, and a direct confirm returns 422 `missing_trial_number`. Answering "ensayo 6" sets the number.
- **AC-7**: Repeated trial (RN-02): a card whose trial number already exists and has no target shows the choice "Corregir ensayo 3" or "Es otro ensayo" (`choose_trial`), with `can_confirm` false (a direct confirm returns 409 `trial_exists`). Choosing correction (`POST /api/proposals/{id}/trial` with `kind = correction`, or typing "es corrección") sets the target; the card then shows each carried value's saved value next to the new one, and confirm updates only those variables (spec 0002, AC-7). Choosing a new trial (`kind = new`, or "es otro ensayo") clears the number and asks for it; "es el ensayo 7" sets 7 directly.
- **AC-8**: Another trial while one is pending: with trial 6's card pending (it has a trial number and values), "Ensayo 7, 60 grados" leaves card 6 unchanged and asks "Tienes el ensayo 6 sin guardar. ¿Lo guardo o lo descarto?" (`pending_other_trial`). The browser keeps that sentence as the waiting sentence. When the next response reports `saved` or `discarded` (from the Guardar or Descartar buttons, or from typing "guárdalo" or "descártalo"), `CaptureStage` sends the waiting sentence again as a normal turn, so trial 7's card appears with no retyping. If card 6 is flagged (AC-23), the waiting sentence is also kept through a value check response and a `check_values` reply. Any other response, or a new sentence, drops the waiting sentence. Nothing about it is stored on the server.
- **AC-9**: Units (RN-01): "grados", "grados centígrados", "°C" map to °C; "por ciento", "%" to %; "minutos", "min" to min. Known conversions run in code: "2 horas" on a min variable gives 120 min, "1200 segundos" gives 20 min, "338,15 kelvin" gives 65 °C. No unit said means the variable's unit. An unknown unit word or one of the wrong kind ("65 pascales" on °C) sets nothing and asks, naming the variable and its unit. A variable without a unit (pH) takes the number only when no unit is said.
- **AC-10**: Numbers and grounding (RNF-04): code reads digits with a comma or dot decimal ("73,5", "73.5") and Spanish words with "coma" or "punto" ("setenta y tres coma cinco"), plus "menos" for negatives. Every value the model returns must come with the exact words it read (`number_text`); those words must appear in the sentence as whole words (so "6" does not match inside "65", nor "tres" inside "trescientos") and parse to the same number. When they don't, code reads every number in the sentence and accepts the value only if exactly one of them equals it. A value read from the trial words ("ensayo 6", "prueba 6", "corrida 6") is rejected, two values for one variable or one number used for two variables are both dropped, and a trial number that is not among the sentence's numbers is ignored. A dropped value makes the card ask for that variable (`unclear_number` or `ambiguous_variable`); two values for one variable that both appear in the sentence ask which one with `two_values`, quoting the user's own words for each ("temperatura reflujo 23 a 71" → "Dijiste 23 y 71 para Temperatura de reflujo. ¿Cuál guardo?"). No value reaches the card that is not in the user's words.
- **AC-11**: Unclear variable: a number with no variable ("ensayo 6, cincuenta"), or a name that matches no variable or more than one, sets nothing for it and asks, listing the candidate variable names. Names match on `variable.name` and `variable.aliases`, ignoring case and accents.
- **AC-12**: Every reply the user reads comes from templates in `api/app/services/replies.py`, keyed by a reason code; the model's text never reaches the user. A question about the data or a chart request replies `not_supported_yet` ("Por ahora solo registro mediciones. Pronto podré responder preguntas y graficar."); anything else off topic replies `off_topic`.
- **AC-13**: Discarding (the button, `POST /api/proposals/{id}/discard`, or typing "descártalo") clears the card and saves nothing; with no card pending it replies `no_pending`.
- **AC-14**: AI failure (RNF-09): when Ollama fails, times out, or returns output that fails validation, Claude is tried; when both fail or `LLM_DEADLINE_S` passes, the route returns 503 `llm_unavailable` ("No pude procesarlo. Intenta de nuevo o edita la tarjeta."). The pending card is unchanged and stays editable by hand; the user turn stays stored with no assistant turn. Every fallback is logged with its reason. Reaching `CLAUDE_MAX_CALLS_PER_HOUR` for a holder counts as a Claude failure (reason `claude_cap`).
- **AC-15**: Keys and dev: in `ENV=prod` the API refuses to start without `OLLAMA_API_KEY` and `ANTHROPIC_API_KEY`. In `ENV=dev` a missing key skips that provider; with none, the utterance route returns 503 `llm_unavailable`. `LLM_PROVIDER=fake` (refused in prod) uses a scripted provider so the flow can be clicked through locally.
- **AC-16**: Input and access: text is trimmed and must be 1 to 500 characters (else 422 `invalid_text`); an edited value must be a finite number (else 422 `invalid_value`). An unknown experiment returns 404 `experiment_not_found`, an unknown proposal 404 `proposal_not_found`, a variable outside the proposal's experiment 404 `variable_not_in_experiment`, and acting on a resolved card 409 `not_pending`. Every route requires the access session (feature 19) and returns 401 without it.
- **AC-17**: `GET /api/experiments/{id}/proposal` returns the pending card (or null) with its question worked out from saved state (`choose_trial`, `missing_trial`, `missing_values`, `check_values`, or ready), so a reload shows the card where it was. Reasons that depend on one sentence (`ambiguous_variable`, `two_values`, `unknown_unit`, `unclear_number`, `pending_other_trial`) appear only in that turn's response.
- **AC-18**: `CaptureStage` (web) shows a text field (at most 500 characters, Enter sends) above the `ProposalCard`. On success the field clears; on failure it keeps the text and shows the message. The card follows the proposal: `proposed` (light or flagged, AC-23), `needs_clarification` with the question, `choose_trial` with its two buttons, `pending_other_trial` (the question with Guardar and Descartar, AC-8), `correction` with saved and new values, `saving`, `saved`, and `save_error`. A response carrying both `saved` and a new card shows `saved` first, then the new card. Inline edits call the edit route. Only one request runs at a time. It renders at `/dev/capture?experiment={id}` outside production, and vitest-axe reports no violations in its states, the flagged `proposed` look included.
- **AC-19**: Each turn logs one JSON line with `llm_provider`, `llm_ms`, `fallback_reason`, `db_ms`, and `total_ms`. The context is read in one database pass before the model call. With real keys, the live smoke test returns each of its 10 sentences in 5 s or less (RNF-02).
- **AC-20**: The turn service takes `source` as a parameter, so feature 8 calls it with `voice` and the same sentence gives the same proposal values (RF-04).
- **AC-21**: Said vs understood: every value set from a sentence stores `said_text`, the exact slice of the user's sentence that grounding matched, extended over the unit words when they follow the number directly ("rendimiento setenta y tres por ciento" stores "setenta y tres por ciento"; "2 horas" stores "2 horas"). Code finds those unit words itself with the unit table; they, not the model's `unit_text`, decide the conversion. When the model reports a `unit_text` but no known unit word follows the number, the value is dropped and the card asks (`unknown_unit`). It is the user's own text, never the model's `number_text`. Confirm copies it to `measurement.said_text`. A hand edit stores null. The card shows each value as `"{said_text}" → {value} {unit}`, or "Escrito a mano" when null, and highlights the understood side only when LabFlow interpreted something: the number was in words, or the unit was converted ("74 %" said as "74 por ciento" is not highlighted).
- **AC-22**: The save button names what it saves (values with a number, in position order, comma decimals, no thousands grouping, "{value} {unit}" or the number alone when unitless): one value "Guardar 73 %"; two values "Guardar 65 °C y 20 min"; three or more "Guardar ensayo 6 · 3 valores". In a correction: one value "Reemplazar 74 % por 73 %" (or "Guardar 73 % en ensayo 3" when the saved trial had no value for it); two or more "Reemplazar ensayo 3 · 2 valores". While saving it reads "Guardando…". The `pending_other_trial` Guardar button uses the same rule for card 6.
- **AC-23**: Light vs flagged: a value is flagged when one or more reasons hold, and the card shows all of them, in this order: `out_of_range` (below `variable.min_value` or above `variable.max_value`; "Fuera del rango esperado: 20 a 100 °C"), `converted` ("Convertí {said_text} a {value} {unit}", e.g. "Convertí 2 horas a 120 min"), `code_match` (grounding used the code side fallback; "Revisa que este valor sea de {name}"). A correction is not flagged per value: choosing "Corregir" (AC-7) is its extra step, and the card already shows saved against new. A card with no flagged value is light: it looks as today and saves in one tap. A card with any flagged value is flagged: a different look (amber edge, title "Revisa antes de guardar"), each flagged value shows its reasons and one check button ("Sí, es 120 min") that covers all of them, and the save button stays disabled until every flagged value is checked or edited by hand. A hand edit counts as checked even when the typed value is out of range, because the user typed it. The card lists the flagged values first in its live region text.
- **AC-24**: Checks are enforced by the API, not only the card: `POST /api/proposals/{id}/values/{variable_id}/check` marks a flagged value checked (storing no turn) and returns the card with its question worked out from saved state, as a reload does (AC-17). Setting a value from a sentence clears its check, and setting or clearing the card's correction target clears every check on the card. `can_confirm` is false while a flagged value is unchecked; a direct confirm then returns 409 `unchecked_values`, and typing "sí, guárdalo" replies `check_values` ("Antes de guardar, revisa {names}.") and saves nothing. No special rule clears a flag: a new sentence stores new `said_text` and `grounding`, and the flags are worked out again from them, so saying "120 minutos" leaves no `converted` reason.
- **AC-25** (follow-up fix, 2026-10-29): Short answers. Code, not the model, plans a reply to the question LabFlow just asked when the sentence is only that answer, whatever tool the model picked. After `missing_trial` on a card with no number, a lone positive whole number ("5", "el 5", "ensayo 5") sets the trial number. After `two_values` about one variable, a lone number ("71", "71 grados") sets that variable. After `ambiguous_variable` naming exactly one variable, a plain yes ("sí", "sí, es esa", "correcto", "claro", "exacto", "eso"; no other words) sets that variable from the earlier sentence, when exactly one of its numbers is not already on the card; the value keeps that sentence's words as `said_text` and that turn as its phrase. Every value still goes through grounding, unit reading, and the flags. A lone number when nothing asked for it is still `ambiguous_variable`, and "sí" after a question naming several variables picks none.
- **AC-26** (follow-up fix, 2026-10-29): A variable with no unit takes a known unit word as written: "65 grados" on a unitless "temperatura" stores 65 with `said_text` "65 grados", no conversion and no flag. A unit word outside the table, reported by the model, is still `unknown_unit` ("Dímelo sin unidad.").

## Decision

**Chosen option**: Option 1: The model picks one tool and quotes its words; code checks, converts, decides, and replies.

Each sentence becomes one validated tool call from the `LLMProvider`, and a pure Python planner turns it (with the saved state) into lifecycle operations and one reply reason, so every number is checked against the sentence and every word the user reads comes from a template.

**Implementation skills**: `fastapi` (`fastapi/fastapi`, `.claude/skills/fastapi/`) · `sqlmodel` (`fastapi/sqlmodel`, `.claude/skills/sqlmodel/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `shadcn` (`.claude/skills/shadcn/`, the card's new state) · `claude-api` (built in, the Claude adapter)

**Calls made in this spec** (pick, then the runner up; reasoning in [rationale.md](rationale.md)):
- **The model returns `number_text` (the exact words) next to each value**, and code grounds it. Runner up: code finds numbers on its own and the model only maps them to variables.
- **One new tool, `elegir_ensayo`**, for answering "corrección o ensayo nuevo" in words. This amends spec 0001's tool list. Runner up: overloading `corregir`.
- **The waiting sentence of AC-8 lives in the browser**, which sends it again after card 6 is saved or discarded. No server replay, no new tables or columns. Runner up: a server side replay keyed by turn ids.
- **Code backs up the grounding**: when the model's `number_text` is not in the sentence, a value is still accepted if exactly one number in the sentence equals it. Runner up: drop it and ask.
- **Claude is started early (a hedge)**: if Ollama has not answered after `OLLAMA_HEDGE_S` (1.5 s), Claude starts in parallel and the first valid answer wins, inside `LLM_DEADLINE_S` (4.5 s). Runner up: spec 0001's strict sequence, which leaves Claude only 1.5 s.
- **The pending card is read again after the model answers**; if it changed during the call (another tab, a double submit), the same tool call is planned again once against the fresh state. No lock is held across the model call. Runner up: return 409 `stale_card`.
- **The reply reason is stored as the assistant turn's `tool_name`**, for traceability and the eval set.
- **Routes are `async def`; database work runs through `run_in_threadpool`**, because spec 0002's repositories use sync sessions. Runner up: Asyncer's `asyncify`.
- **The Claude call counter lives in `app.state`**, created in the lifespan and passed in by a dependency, honoring the no module level state rule. Runner up: a database table.
- **The planner applies operations one repository call at a time** (each commits on its own, as spec 0002 built them). A failure partway leaves a card with fewer values, never a saved measurement. Runner up: a new combined repository function in one transaction.
- **`gpt-oss:120b` is the default `OLLAMA_MODEL`**, confirmed by the live smoke test at build. Runner up: the largest Qwen 3 cloud model.
- **The system prompt is Spanish**, in `api/app/ai/prompts/capture.md`, listing variables (id, name, unit, aliases), the pending card, existing trial numbers, and the last 10 turns.

**Calls added by the pitch feedback amendment** (2026-10-28; reasoning in [rationale.md](rationale.md#amendment-pitch-feedback-2026-10-28)):
- **The said words are stored, not recomputed**: a nullable `said_text` on `proposal_value` and `measurement`, cut from the user's sentence at the span grounding matched. Runner up: run `find_numbers` on `original_phrase` again at read time, which can land on a different span than the one grounding used.
- **Two more columns on `proposal_value` only**: `grounding` (`model`, `code`, or null for a hand edit), because `code_match` cannot be derived again after a reload, and `checked_at`, so the API can refuse an unchecked confirm. Runner up: keep both in the browser, which a reload or a typed "sí" would skip.
- **Every other flag reason is derived, not stored**: `out_of_range` from `variable.min_value`/`max_value`, `converted` from the unit words in `said_text` against `variable.unit`. So a teacher changing a range later moves the flags with it.
- **Corrections are not flagged per value**: choosing "Corregir" is already the effort, and flagging every replaced value would bring the fatigue back on the correction path.
- **Code decides the unit from the sentence**: `said_slice` finds the unit words after the number with the unit table, and those words drive `normalize`, so `said_text` and the conversion always agree.
- **Basic range checking moves into this feature** (a pure comparison, the columns already exist). Feature 11 keeps unit fit warnings and comparisons with earlier trials.
- **The button label is a pure web function** (`saveLabel` in `proposal-card/copy.ts`), not a server field, because it is display copy.

**Calls added by the follow-up fix** (2026-10-29, from real conversations where the student answered LabFlow's own questions and got the same question back):
- **Short answers are planned by code from the last question** (AC-25): the assistant turn already stores its reason in `tool_name`, and now also the variables it named, so "5" after "¿Qué número de ensayo es?" and "sí" after "¿Es Temperatura de reflujo?" do not depend on the model reading the conversation. Runner up: let the model re-propose the earlier value and ground it against the previous sentence, which still loops whenever the model asks again.
- **The suggestion is stored on the turn**: a nullable `turn.variable_ids bigint[]`. Runner up: parse the names back out of the reply text, which breaks as soon as a template changes.
- **Two values for one variable ask which one** (`two_values`, quoting the user's words) instead of "¿Es {name}?", a yes/no question that a "sí" could not answer.
- **A unitless variable takes a unit word as written** (AC-26) rather than refusing it: the user did not give the variable a unit, so there is nothing to convert to, and `said_text` keeps the words for provenance.

## Feature design

**Data model sketch**: no new tables. One small Alembic migration (amendment) adds nullable columns to spec 0002's tables; everything else goes through its repository functions:

| Table | How this feature uses it |
|---|---|
| `turn` | one `user` turn per sentence or hand edit (`source` text, or voice from feature 8); one `assistant` turn per reply, with the reply text, the reason code in `tool_name`, and the variables the reply named in `variable_ids` (follow-up fix) |
| `proposal`, `proposal_value` | through `start_proposal`, `set_trial`, `set_value`, `confirm`, `discard`, `get_pending`, plus the new `check_value` |
| `variable` | read: id, name, unit, aliases, required, position, `min_value`, `max_value` |
| `trial`, `measurement` | read: existing trial numbers, and the saved values shown as `previous` in a correction; written only by `proposals.confirm` |

New columns (all nullable, no backfill; existing rows read as "Escrito a mano" and unchecked):

| Table | Column | Type | Meaning |
|---|---|---|---|
| `proposal_value` | `said_text` | `text NULL` | the user's words for this value; null for a hand edit |
| `proposal_value` | `grounding` | `text NULL`, check in (`model`, `code`) | how the number was found in the sentence; null for a hand edit |
| `proposal_value` | `checked_at` | `timestamptz NULL` | when the user checked a flagged value; cleared by `set_value` from a sentence and, for every value on the card, when the correction target is set or cleared; set to now by a hand edit |
| `measurement` | `said_text` | `text NULL` | copied from `proposal_value.said_text` on confirm, for the provenance view (feature 7) |
| `turn` | `variable_ids` | `bigint[] NULL` | (follow-up fix, its own migration) the variables an assistant reply named, so a short answer can accept them (AC-25) |

Repository changes (spec 0002's `proposals.py`): `set_value` gains `said_text: str | None` and `grounding: Grounding | None` (included in the upsert's replaced columns; `checked_at` becomes null, or now when `grounding` is null); `check_value(session, proposal_id, variable_id) -> ProposalValue | NotPending | ProposalNotFound | VariableNotInExperiment` sets `checked_at`; the function that sets or clears the target nulls `checked_at` on the card's values in the same transaction; `_upsert_measurements` copies `said_text`. Carried values keep their `said_text` and `grounding` through trial and target changes.

**The tool call** (`api/app/ai/tools.py`, a Pydantic discriminated union on `tool`; both adapters must return it):

| Tool | Arguments |
|---|---|
| `proponer_medicion` | `trial_number: int \| None`, `values: list[ExtractedValue]` |
| `corregir` | `values: list[ExtractedValue]` (changes values on the pending card) |
| `elegir_ensayo` | `kind: "correccion" \| "nuevo"`, `trial_number: int \| None` |
| `confirmar` | none |
| `descartar` | none |
| `pedir_aclaracion` | `reason: "ambiguous_variable" \| "off_topic" \| "not_supported_yet"`, `variable_ids: list[int]` |

`ExtractedValue` = `variable_id: int`, `number_text: str` (the exact words read), `value: float`, `unit_text: str | None` (the unit words as said). `consultar_dato` and `graficar` stay for features 10 and 9. Both adapters turn a tool name outside this union (including those two) into `pedir_aclaracion(reason="not_supported_yet")` before validation, so it never counts as a failure.

**The planner** (`api/app/services/turn_plan.py`, pure): `plan_turn(context, call, utterance) -> TurnPlan`, where `context` holds the variables, the pending proposal and its values, the experiment's existing trial numbers, and the last turns, and `TurnPlan` holds an ordered list of operations (`StartProposal(n)`, `SetTrial(n)`, `SetTarget(trial_id)`, `ClearTarget`, `SetValue(variable_id, value)`, `Confirm`, `Discard`) plus one reply reason and its `variable_ids`. Rules:
0. Short answers (AC-25): when the turn before this sentence was LabFlow's reply to the user sentence before it, `context.last_question` holds that reply's reason, its `variable_ids`, and that sentence. If this sentence is a short answer to it, code plans it and the model's call is not used: `SetTrial(n)` after `missing_trial`; one value for the named variable after `two_values`, read from this sentence; one value for the named variable after a one variable `ambiguous_variable` and a plain yes, read from the earlier sentence and tied to its turn. Values read this way go through step 1 like any other.
1. Each `ExtractedValue` goes through `ground` (`services/numbers.py`), then `said_slice` (which finds the unit words after the span), then `normalize` (`services/units.py`) with those unit words, not the model's `unit_text`. An accepted value's `SetValue` carries `said_text` and `grounding` (`model` or `code`, from `ground`). A failure drops that value and sets the reason `unclear_number` or `unknown_unit` for its variable. A `variable_id` not in the experiment, two values for one variable, or one number span used for two variables drops those values and sets `ambiguous_variable`; two values for one variable that both ground in the sentence set `two_values` instead, with their `said_text` slices in sentence order. A trial number that is not among the sentence's numbers is treated as not said.
2. `proponer_medicion` with no card pending: `StartProposal(trial_number)` then the values. With a card pending: no trial number, or the card's own number, adds the values. A number on a card that has no number yet, or that is in `choose_trial`, gives `ClearTarget` and `SetTrial(n)` plus the values. A different number on a card that already has a number and values gives `pending_other_trial` and no operations. A different number on a card with no values gives `SetTrial(n)` plus the values.
3. `corregir` with a card pending sets its values; with none, it acts as `proponer_medicion`.
4. `elegir_ensayo`: `correccion` gives `SetTarget(the existing trial's id)`; `nuevo` gives `ClearTarget` and `SetTrial(trial_number)` (null when not said).
5. `confirmar` and `descartar` with no card give `no_pending`. `confirmar` while the card cannot be confirmed gives that card's question instead (with unchecked flagged values, that is `check_values`). A `confirmar` whose sentence also carries numbers ("sí, ensayo 7") is ignored and the reply is the card's current question.
6. After the operations, the reply reason is the first that holds: a reason from step 1 to 5 · `choose_trial` (the number exists and there is no target) · `missing_trial` · `missing_values` (the card has no values, naming every variable, or required variables are still empty, naming those) · `check_values` (a flagged value is unchecked, naming those) · `ready` ("¿Lo guardo?"). After a confirm it is `saved`; after a discard, `discarded`.

**The executor** (`api/app/services/turns.py`) applies the operations in order through spec 0002's repositories, passing along the proposal id that `StartProposal` returns and the user turn id that every `SetValue` needs. A typed error partway stops the remaining operations: `NotPending` returns 409 `not_pending`; `InvalidTrialNumber` (the model said 0 or less) becomes the reply `missing_trial`; `TrialExists` on confirm becomes `choose_trial`; `TrialNotInExperiment` returns 404 `trial_not_in_experiment`. The assistant turn is stored only when a reply is returned with 200. Every 200 response carries the current `ProposalView` read after the operations, so the web always shows what the database holds. Before applying, the executor reads the pending card again; if its id or `updated_at` differs from the context the model saw, it plans the same tool call once more against the fresh state.

**Number reading** (`api/app/services/numbers.py`, pure): `parse_number(text) -> float | None` handles digits (`73`, `73,5`, `73.5`, `1.200` with a dot as thousands only when followed by exactly 3 digits and no decimal), Spanish words from cero to novecientos noventa y nueve mil (`uno`/`un`/`una`, `veintiún`, `cien`/`ciento`, `mil`), `coma` or `punto` decimals ("setenta y tres coma cinco", "siete coma cero cinco"), and `menos`. `find_numbers(utterance) -> list[Span]` returns every number in the sentence with its position, marking spans that follow `ensayo`, `prueba`, or `corrida` as trial spans. `ground(utterance, number_text, value) -> Span | None` folds accents and case, matches `number_text` only on whole word boundaries (regex lookarounds), and checks that `parse_number(number_text)` equals `value` within 1e-9. If that fails, it accepts the single non trial span in `find_numbers` whose value equals `value`, and fails when there are zero or several. A value whose span is a trial span always fails. `ground` returns the `Span` plus how it matched (`model` for the first path, `code` for the fallback). `said_slice(utterance, span) -> Said` returns the original (not folded) text of the span, extended to the end of the longest unit synonym (`units.match_unit_at`) that starts right after it with only spaces between, plus that unit's canonical form (or none). If the model reported a `unit_text` and `Said` has no unit, the planner drops the value with `unknown_unit`.

**Flags** (`api/app/services/flags.py`, pure): `flags(value_row, variable) -> tuple[Flag, ...]`, in order `out_of_range`, `converted` (`units.split_unit(said_text)` gives unit words whose canonical unit differs from `variable.unit`), `code_match` (`grounding == "code"`); empty means light. `unchecked(values) -> tuple[int, ...]` returns the variable ids that have flags and no `checked_at`; the confirm route and the planner's `check_values` both use it. `interpreted(said_text, variable) -> bool` is true when the number part of `said_text` has no digit or the unit was converted. `flag_text(flag, ...)` renders the Spanish reason (AC-23); `converted` is "Convertí {said_text} a {value} {unit}"; numbers in it use the variable's unit and come from the database or `said_text`.

**Units** (`api/app/services/units.py`, pure): synonyms to canonical unit: `°C` ← grados, grados celsius, grados centígrados, centígrados, °C, ºC, C · `K` ← kelvin, K · `°F` ← grados fahrenheit, °F · `%` ← por ciento, porciento, % · `min` ← minutos, minuto, min · `h` ← horas, hora, h · `s` ← segundos, segundo, s. Conversions to the variable's unit: `K → °C` (minus 273.15), `°F → °C` ((x − 32) × 5/9), `h → min` (× 60), `s → min` (÷ 60), `min → h`, `min → s`, and the inverses. Unit words match whole tokens only after folding, so a lone `C` or `s` never matches inside another word. Results are rounded to 6 decimals. A unit not in the table, or a pair with no conversion, gives `unknown_unit`. A variable whose own unit is not in the table accepts only its exact unit text or none. A variable with no unit takes any unit word from the table as written, with no conversion (AC-26).

**Replies** (`api/app/services/replies.py`, pure): `reply_text(reason, names) -> str`, Spanish templates, with variable names joined as "a, b y c":

| Reason | Text |
|---|---|
| `ready` | ¿Lo guardo? |
| `missing_values` | Me falta {names}. ¿Cuánto fue? / ¿Cuánto fueron? |
| `missing_trial` | ¿Qué número de ensayo es? |
| `choose_trial` | El ensayo {n} ya existe. ¿Es una corrección o un ensayo nuevo? |
| `pending_other_trial` | Tienes el ensayo {n} sin guardar. ¿Lo guardo o lo descarto? |
| `ambiguous_variable` | No sé a qué variable va ese valor. ¿Es {names}? (with no candidates: ¿A qué variable corresponde?) |
| `two_values` | Dijiste {said} para {name}. ¿Cuál guardo? ({said}: the user's words for each value, joined as "a y b") |
| `unknown_unit` | No reconozco esa unidad para {name}. Dímelo en {unit}. |
| `unclear_number` | No entendí el valor de {names}. ¿Me lo repites? |
| `check_values` | Antes de guardar, revisa {names}. |
| `saved` | Guardado el ensayo {n}. |
| `discarded` | Descarté la tarjeta. |
| `no_pending` | No hay nada pendiente. |
| `not_supported_yet` | Por ahora solo registro mediciones. Pronto podré responder preguntas y graficar. |
| `off_topic` | Solo registro mediciones de este experimento. |

`{n}` is the trial number from the database, never from the model.

**Providers** (`api/app/ai/`): `LLMProvider` is a `Protocol` with `async def decide(context: TurnContext, utterance: str) -> ToolCall`. Adapters: `providers/ollama.py` (`ollama.AsyncClient`, tools plus the JSON schema `format`, parsed with Pydantic), `providers/anthropic.py` (Claude Haiku 5.5: `strict: true` tools, `tool_choice: auto`, adaptive thinking with `output_config={"effort": "low"}` set explicitly because Haiku 5.5 defaults to `medium`; Haiku 5.5 has no server side refusal fallback, so a `refusal` stop reason counts as a Claude failure), `providers/fallback.py` (a hedged race inside `LLM_DEADLINE_S`: Ollama starts at once; Claude starts when Ollama fails, returns invalid output, or has not answered after `OLLAMA_HEDGE_S`; the first valid `ToolCall` wins and the other call is cancelled; Claude is capped at `CLAUDE_TIMEOUT_S`; the reason Claude was used is logged), and `providers/fake.py` (dev and tests: a scripted provider; tests pass in the exact `ToolCall` they want). `get_provider` (a dependency) builds the chain from `LLM_PROVIDER` and the keys present.

**The Claude counter**: a per holder sliding window of call times over the last hour, held in `app.state` (created in the lifespan), guarded by an `asyncio.Lock`. It is per process; with one worker on Railway (spec 0001) that is the whole API, and it resets on redeploy. The holder is the name returned by feature 19's session dependency.

**State transitions**: the proposal lifecycle is spec 0002's (pending → confirmed, discarded, or superseded). This feature never supersedes a card with values (AC-8 asks instead); `start_proposal` only supersedes when there is no pending card, so in practice never. The card, client side: `proposed` (light or flagged, from the values' flags) ⇄ `editing` · `checking` (one check request in flight) · `needs_clarification` · `choose_trial` → `correction` (after "corrección") · `pending_other_trial` (holding the waiting sentence) → `saving` or cleared → the waiting sentence is sent · any of these → `saving` → `saved` (then cleared) or `save_error` → `saving` (retry).

**API surface** (router `api/app/routers/capture.py`; every route behind the access session):

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/experiments/{id}/utterances` | POST | `text: str` (1 to 500 after trim) | `TurnResponse` | session | 401, 404 `experiment_not_found`, 422 `invalid_text`, 503 `llm_unavailable` |
| `/api/experiments/{id}/proposal` | GET | none | `ProposalView \| null` | session | 401, 404 `experiment_not_found` |
| `/api/proposals/{id}/values/{variable_id}` | PUT | `value: float` (finite, in the variable's unit) | `TurnResponse` | session | 401, 404 `proposal_not_found` or `variable_not_in_experiment`, 409 `not_pending`, 422 `invalid_value` |
| `/api/proposals/{id}/trial` | POST | `kind: "correction" \| "new"`, `trial_number: int \| None` | `TurnResponse` | session | 401, 404 `proposal_not_found` or `trial_not_in_experiment`, 409 `not_pending`, 422 `invalid_trial_number` |
| `/api/proposals/{id}/values/{variable_id}/check` | POST | none | `TurnResponse` | session | 401, 404 `proposal_not_found` or `variable_not_in_experiment`, 409 `not_pending` |
| `/api/proposals/{id}/confirm` | POST | none | `TurnResponse` with `saved` | session | 401, 404, 409 `not_pending`, `trial_exists`, or `unchecked_values`, 422 `missing_trial_number` or `empty_proposal` |
| `/api/proposals/{id}/discard` | POST | none | `TurnResponse` | session | 401, 404, 409 `not_pending` |

`TurnResponse` = `{ turn_id: int | None, reply: { reason, text } | None, proposal: ProposalView | None, saved: { trial_id, trial_number, created } | None }`.
`ProposalView` = `{ id, trial_number: int | None, target_trial_id: int | None, values: [{ variable_id, name, unit, value: float | None, previous: float | None, said_text: str | None, interpreted: bool, flags: [{ reason, text }], checked: bool }] (every variable, by position), phrase: str, source, flagged: bool, question: { reason, text } | None, can_confirm: bool }`. Errors use the shared `{code, message}` shape with Spanish messages. Confirm calls `flags.unchecked` on the card's values and variables before calling spec 0002's `confirm` (409 `unchecked_values` when not empty), so `proposal_rules.plan_confirm` stays unchanged.

Buttons store no turns: confirm, discard, the trial choice, and the value check return `turn_id = null` and their reply from the templates (`saved`, `discarded`, or the card's new question). The hand edit stores its "Editado" user turn and returns the recalculated question; it checks the proposal is pending, the variable belongs to its experiment, and the value is finite before storing that turn, so a rejected edit leaves no turn behind. An utterance that ends in 503 keeps its user turn (the sentence was said) and stores no assistant turn. Only `/utterances` is an `async def` hot path; the other routes are plain `def`. The web hooks convert snake_case responses into the card's camelCase props in the query `select` functions; the generated `schema.d.ts` stays snake_case.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| utterance | user turn `text`, `source` | request `text` (trimmed); `source` = `text` from this route, `voice` from feature 8 |
| utterance | variable id, value | the tool call's `ExtractedValue`, accepted only after `ground` and `normalize` |
| utterance | value in the variable's unit | `normalize(value, unit_text, variable.unit)`; no `unit_text` means `variable.unit` |
| utterance | trial number | the tool call's `trial_number` (grounding not needed: it only labels, and the card shows it before saving) |
| utterance | which card is "the pending one" | `proposals.get_pending(experiment_id)`, never the model |
| hand edit | value | request `value` (already in the variable's unit) |
| hand edit | phrase, `source`, time | a new user turn `f"Editado: {variable.name} {value:g} {variable.unit}"` (the unit and its space left out when the unit is null), `source = text`, `created_at` |
| correction | `previous` per variable | `measurement.value` of the target trial for that variable; null when the trial has no value for it (the card shows the value as new) |
| `choose_trial` | existing trial id | `trial` by `(experiment_id, proposal.trial_number)` |
| `pending_other_trial` | waiting sentence | the text the browser just sent, held in `CaptureStage` state |
| stale check | card version | `proposal.id` and `proposal.updated_at`, read before the model call and again after |
| reply | text | `reply_text(reason, names)`; names from `variable.name`, `{n}` from `proposal.trial_number` |
| assistant turn | `tool_name` | the reply reason code |
| `ProposalView.phrase` | sentence shown on the card | the latest user turn tied to the card's values (max `proposal_value.turn_id`), else the latest user turn |
| `ProposalView.can_confirm` | derived | has values, has a trial number, not `choose_trial`, and no unchecked flagged value |
| utterance | `said_text` per value | `said_slice(utterance, span)`: the user's own text at the grounded span plus the unit words code found after it, never the model's `number_text` |
| utterance | unit used by `normalize` | the canonical unit from `said_slice`; none means `variable.unit` |
| utterance | `grounding` per value | `ground`'s match kind: `model` or `code` |
| hand edit | `said_text`, `grounding`, `checked_at` | null, null, now |
| check | `checked_at` | `utc_now()` in `check_value` |
| check | returned question | `proposal_view` from saved state only (as AC-17) |
| target set or cleared | `checked_at` on all values | null |
| confirm | `measurement.said_text` | `proposal_value.said_text` |
| `ProposalView.values[].interpreted` | highlight on the card | `flags.interpreted(said_text, variable)`; false when `said_text` is null |
| `ProposalView.values[].flags` | reasons and texts | `flags.flags(...)` from `variable.min_value`/`max_value`, `variable.unit`, `said_text`, `grounding` |
| `pending_other_trial` | waiting sentence kept or dropped | kept on `saved`, `discarded`, a check response, or `check_values`; dropped on any other response or a new sentence (`CaptureStage` state) |
| `ProposalView.values[].checked` | derived | `checked_at` is not null |
| `ProposalView.flagged` | derived | any value has at least one flag |
| save button label | text | `saveLabel(values, trialNumber, isCorrection)` in `proposal-card/copy.ts`, from `value`, `unit`, `previous` |
| check button label | text | `"Sí, es {value} {unit}"` in the same copy file |
| number on the card and buttons | format | `Intl.NumberFormat("es-ES", { useGrouping: false, maximumFractionDigits: 6 })` (comma decimal) |
| `saved` | trial id, number, created | spec 0002's `Confirmed.trial_id` and `Confirmed.created_trial`, plus `proposal.trial_number` |
| Claude cap | holder | the access session's holder name (feature 19) |
| logs | timings | `time.perf_counter()` around the LLM call and the database work |

**Key invariants**:
- The model never writes text the user reads, and never chooses which proposal to act on.
- Every value on a card was grounded in a user's words or typed by hand.
- Nothing is saved except by `proposals.confirm`, and only on the user's button or the user's own "sí" while a card is pending.
- At most one pending card per experiment; a turn never supersedes a card that has values.
- Every number shown to the user is in the variable's unit and from the database or the user's input.
- `said_text` is always a slice of the user's own sentence, or null; the model's words are never shown as "what you said".
- No flagged value is saved unless it was checked or typed by hand, whatever path the confirm comes from.
- No module level mutable state: the Claude counter lives in `app.state`.

**Security model**: every route requires the access session (feature 19); every holder may act on every experiment (spec 0002). API keys stay in the API's env (RNF-08); the browser never sees them. The prompt holds only the experiment's own data. User text is capped at 500 characters. Data is fictitious lab data; no compliance scope. Logs record the holder and timings, never keys.

**Configuration required** (`api/.env`, Railway, and `api/.env.example`):
- `LLM_PROVIDER`: `fallback` (default) · `ollama` · `anthropic` · `fake` (refused when `ENV=prod`)
- `OLLAMA_HOST`: Ollama Cloud base URL (default `https://ollama.com`)
- `OLLAMA_API_KEY`: required in prod, optional in dev
- `OLLAMA_MODEL`: default `gpt-oss:120b` (verify at build)
- `OLLAMA_HEDGE_S` (default `1.5`, when Claude starts in parallel), `LLM_DEADLINE_S` (default `4.5`, overrides spec 0001's `4`), `CLAUDE_TIMEOUT_S` (default `3`), `CLAUDE_MAX_CALLS_PER_HOUR` (default `30`). `OLLAMA_TIMEOUT_S` from spec 0001 is replaced by the hedge.
- `ANTHROPIC_API_KEY`: required in prod, optional in dev
- `ANTHROPIC_MODEL`: default `claude-haiku-5-5` (overrides spec 0001's Opus 5.5: about 40 times cheaper per turn and faster inside the 1.5 to 3 s Claude window; grounding still blocks any invented number). Switching back to `claude-opus-5-5` is this one setting.

**Critical test scenarios** (pytest with `FakeProvider` against the dev Postgres; Vitest for the web):
- Happy path: the AC-1 sentence, then confirm; trial 6 saved with three values and phrases, verifies **AC-1**, **AC-2**, **AC-20**
- Parts and corrections: "Ensayo 6, 65 grados", then "rendimiento 74", then "No, el rendimiento es setenta y tres", then a hand edit to 72; one card, Rendimiento 72 with the "Editado" phrase, verifies **AC-3**, **AC-4**, **AC-5**
- Trial rules: no number blocks confirm; trial 3 shows `choose_trial`; "es corrección" shows previous values and updates only those; "ensayo 6" on a numberless card with values sets 6 (no `pending_other_trial`); trial 7 while 6 is pending, then "guárdalo", saves 6 and the browser sends the waiting sentence, opening 7; "sí, ensayo 7" does not confirm, verifies **AC-6**, **AC-7**, **AC-8**
- Stale card: the card changes while the fake provider waits; the plan runs again on the fresh card, verifies **AC-3**
- Pure tables: `parse_number`, `find_numbers`, and `ground` on 40 cases (digits, words, coma, punto, menos, thousands, a number the sentence lacks, "6" inside "65", "tres" inside "trescientos", a value taken from "ensayo 6", the code side fallback, "50 y 50"); `normalize` on every synonym and conversion and a wrong kind; `reply_text` for every reason, verifies **AC-9**, **AC-10**, **AC-11**, **AC-12**
- Failure: the fake Ollama stalls past the hedge and the fake Claude answers first; an unknown tool name becomes `not_supported_yet`; both fail gives 503 with the card unchanged; the Claude cap reached gives `claude_cap` in the log; prod settings without keys refuse to start, verifies **AC-14**, **AC-15**, **AC-19**
- Reload: after an ambiguous turn, `GET .../proposal` shows the card with its derived question, verifies **AC-17**
- Auth and input: no session gives 401 on all seven routes; 501 characters gives 422; a resolved card gives 409, verifies **AC-13**, **AC-16**
- Web: `CaptureStage` renders each card state, keeps text on a 503, blocks a second send in flight, and passes axe, verifies **AC-18**
- Said text: "rendimiento setenta y tres por ciento" stores "setenta y tres por ciento" and highlights; "74 por ciento" stores it and does not highlight; a code fallback match still stores the user's words; a hand edit stores null and shows "Escrito a mano"; confirm copies `said_text` to the measurement, verifies **AC-21**
- Button: `saveLabel` table tests for 0, 1, 2, and 3 values, unitless, decimals ("73,5 %"), and both correction forms, verifies **AC-22**
- Flags: "Ensayo 6, 2 horas" flags `converted`; 500 °C on a 20 to 100 variable flags `out_of_range`; 932 °F on that variable shows both reasons under one check; a fallback match flags `code_match`; a correction from 74 to 73 is not flagged; a model `unit_text` with no unit word after the number gives `unknown_unit`; the light card saves in one tap; the flagged card keeps Guardar disabled until each value is checked; a hand edit to an out of range value counts as checked; a direct confirm gives 409 `unchecked_values`; "sí, guárdalo" gives `check_values`; a new sentence clears a check; choosing "Corregir" clears all checks; "120 minutos" leaves no `converted`; a reload shows `check_values`; card 6 flagged with trial 7 waiting keeps the waiting sentence through the check and sends it after saving, verifies **AC-8**, **AC-17**, **AC-23**, **AC-24**
- Short answers: "5" after `missing_trial` sets the trial whatever the model returns, but not when nothing asked for a number; "temperatura reflujo 23 a 71" asks `two_values` and "71" sets it; "sí" after a one variable `ambiguous_variable` sets that value from the earlier sentence, and picks nothing after several candidates; "65 grados" on a unitless variable stores 65, verifies **AC-10**, **AC-25**, **AC-26**
- Live (pytest marker `live`, skipped without keys): 10 sentences against each provider, all within 5 s, verifies **AC-19**

## Build plan

Skateboard: first the pure core that makes the trust promise testable with no keys, then the AI edge, then the routes, then the screen. Feature 19 (access gate) is built before this, so routes use the holder from day one.

**Milestone 1: the pure core (no keys needed)**
0. The amendment migration: `said_text`, `grounding`, `checked_at` on `proposal_value` and `said_text` on `measurement` (models, Alembic revision, `make openapi`); `set_value` gains `said_text` and `grounding` and handles `checked_at`; new `check_value`; setting or clearing the target nulls the card's checks; `confirm` copies `said_text`; extend spec 0002's repository tests, satisfies **AC-21**, **AC-24**
1. `api/app/services/numbers.py` (`parse_number`, `find_numbers`, `ground` with word boundaries, trial spans, the code side fallback, and its match kind, plus `said_slice`) with a table of 40 cases, satisfies **AC-10**, **AC-21**
2. `api/app/services/units.py` (synonyms, conversions, `normalize`, `match_unit_at`, `split_unit`) and `api/app/services/replies.py` (reasons and templates, with `check_values`), satisfies **AC-9**, **AC-12**, **AC-24**
3. `api/app/ai/tools.py` (the `ToolCall` union, `ExtractedValue`) and `api/app/services/turn_plan.py` (`TurnContext`, `plan_turn`, the operations, the reply reason order) and `services/flags.py` (`flags`, `unchecked`, `interpreted`, `flag_text`) and `services/proposal_view.py` (builds `ProposalView`, `question`, `can_confirm`, `previous`, `said_text`, `flags`, `checked`, `flagged`), with table tests, satisfies **AC-3**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-11**, **AC-17**, **AC-21**, **AC-23**, **AC-24**

**Milestone 2: the AI edge**
4. Add `ollama` and `anthropic` (pinned) to `api/pyproject.toml`; add the settings above with the prod key validator and the `fake` guard; update `api/.env.example`, satisfies **AC-15**
5. `api/app/ai/providers/` (`ollama.py`, `anthropic.py`, the hedged `fallback.py`, `fake.py`), the unknown tool mapping, `api/app/ai/prompts/capture.md`, the `get_provider` dependency, the Claude counter in `app.state`, and fallback logging, satisfies **AC-12**, **AC-14**, **AC-19**

**Milestone 3: the routes**
6. `api/app/services/turns.py` (`handle_utterance(session, provider, experiment_id, text, source)`: store the user turn, load context in one pass, decide, read the card again and plan again if stale, apply through the executor in the threadpool, store the assistant turn, build the response), satisfies **AC-1**, **AC-2**, **AC-3**, **AC-8**, **AC-13**, **AC-20**
7. `api/app/routers/capture.py` (the seven routes, the check route and the `unchecked_values` guard on confirm, the error mapping to `{code, message}`, the 500 character limit, the per turn log line), registered in `main.py`; `make openapi`, satisfies **AC-4**, **AC-6**, **AC-7**, **AC-16**, **AC-17**, **AC-19**, **AC-24**

**Milestone 4: the screen**
8. `ProposalCard`: add the `choose_trial` state (two buttons, `onChooseTrial(kind)`) and a `canConfirm` prop; each value row shows `"{saidText}" → {value} {unit}` (or "Escrito a mano") with the understood side highlighted when `interpreted`; the save button uses `saveLabel`; the flagged look, each value's reasons and one "Sí, es …" check button (`onCheck(variableId)`), and the disabled save until all are checked; the `warning` prop becomes `flags` plus `checked`; update `/dev/ui` with light and flagged examples and its tests, satisfies **AC-7**, **AC-18**, **AC-21**, **AC-22**, **AC-23**
9. `web/src/hooks/use-capture.ts` (TanStack Query: `usePendingProposal`, `useSendUtterance`, `useEditValue`, `useCheckValue`, `useChooseTrial`, `useConfirm`, `useDiscard`, all through the `openapi-fetch` client) and `web/src/components/capture-stage/` (text field, card state mapping, one request in flight, the waiting sentence of AC-8 sent again after `saved` or `discarded`, `saved` shown before a new card, error copy, `onSaved` callback for features 7 and 20), satisfies **AC-8**, **AC-18**
10. `web/src/app/dev/capture/page.tsx` (dev only, same gate as `/dev/ui`, `?experiment={id}`), satisfies **AC-18**

**Milestone 5: real models**
11. With keys in `api/.env`: run the `live` smoke test on both providers, set `OLLAMA_MODEL`, tune `OLLAMA_TIMEOUT_S` and `LLM_DEADLINE_S` from the logged timings, set the keys in Railway, satisfies **AC-19**

## Consequences

**Positive**:
- "Zero invented numbers" holds by construction: a value the sentence does not contain cannot reach the card, and a template cannot hallucinate.
- The planner, numbers, units, and replies are pure, so most of the behavior is tested with no keys and no network, and the eval set (feature 12) can score the planner directly.
- Feature 8 reuses `handle_utterance` with `source = voice`; feature 20 drops in `CaptureStage`; features 9 and 10 add tools to the same union.
- Confirming stops being a habit: a plain card is one tap that names its value, and only a card with a real reason to look asks for more.
- Every saved measurement keeps the user's own words, so feature 7's provenance view ("Dijiste 'setenta y tres' a las 14:02, LabFlow leyó 73 %") needs no guessing.
- Only one small, additive migration (nullable columns, no backfill).

**Negative / tradeoffs**:
- The model should copy the exact words of each number; when it paraphrases ("73" for "setenta y tres"), the code side fallback saves the value only if exactly one number in the sentence matches, otherwise the card asks.
- Starting Claude early (the hedge) spends some Claude calls that Ollama would have answered a little later.
- The Spanish number reader is hand written and covers up to 999 999 with simple decimals; "tres cuartos" or "un medio" are not read and the card asks.
- Templates sound less natural than a model's own phrasing.
- Operations commit one at a time, so a database failure partway leaves a partly filled card (never a wrong saved value).
- The waiting sentence of AC-8 lives in one browser tab; a reload drops it, and sending it again stores a second user turn with the same text.
- Two adapters to tune, with no keys today: real behavior is unknown until milestone 5, two days before the demo.
- More to build before Friday: a migration, a check route, the flags module, and two card looks. If time runs short, the flagged look and its API guard (AC-23, AC-24) are the part to cut last only after said vs understood and the button (AC-21, AC-22).
- A flagged card adds one tap per flagged value; a sentence with a converted unit and a range miss on two variables means two checks before saving.
- `out_of_range` depends on teachers filling `min_value`/`max_value`; a variable without them never flags on range.

**Neutral**:
- Spec 0001's tool list gains `elegir_ensayo`, and its strict Ollama then Claude sequence becomes a hedged race with `LLM_DEADLINE_S` at 4.5 s.
- Spec 0003's `ProposalCard` gains the `choose_trial` state and `canConfirm`, said vs understood rows, the flagged look, and a value naming save button in place of "Confirmar" and "Reemplazar".
- Spec 0002 gains four nullable columns, a `check_value` repository function, and two parameters on `set_value`.
- Feature 20's text turn contract (spec 0004) is `POST /api/experiments/{id}/utterances` returning `TurnResponse`, and its summary's `pending_proposal` is `ProposalView`.

## Follow-up

- [ ] Get an Ollama Cloud key and an Anthropic key before milestone 5; add them to `api/.env` and the Railway service.
- [ ] Build feature 19 (access gate) before this feature's routes.
- [ ] Spec 0001: add `elegir_ensayo` to the tool list and note the hedged fallback, the 4.5 s deadline, and Claude Haiku 5.5 as the fallback model (`/architect` update, or note it at `/sync`).
- [ ] Set a monthly spend limit in the Anthropic Console (about $5 is plenty with Haiku 5.5).
- [ ] Run the live smoke test as soon as the keys arrive, not on demo eve; the seeded experiment's ids must exist first (`make seed`).
- [ ] Spec 0004: its summary's `pending_proposal` uses `ProposalView` from this spec.
- [ ] Feature 12 (eval set) scores `plan_turn` plus the providers on the same sentences; reuse the live smoke test's runner.
- [ ] Feature 11 adds unit fit warnings and comparisons with earlier trials as more `flag` reasons (basic min/max range now ships here); its "Done when" is partly met by this spec, reconcile at `/scope`.
- [ ] Feature 7: tapping a number shows its provenance from `measurement.said_text`, `said_at`, and the proposal's `resolved_at`.
- [ ] Feature 8: read the save label back by voice, and let a flagged value be checked by repeating it.
- [ ] Spec 0002: note the four new columns and `check_value` (`/sync`).
- [ ] Later: measure blind confirming (confirms under about 1 s with no edit) from turn and proposal times.
- [ ] Ollama and Anthropic conventions belong in a nested `api/app/ai/AGENTS.md` once built (`/sync`).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
