# Verify: Data model · spec 0002 · updated 2026-10-27
_Steps derived from spec 0002 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run against the Supabase `dev` project (or a local Postgres 17 that has `anon` and `authenticated` roles). SQLite cannot check partial indexes, `FOR UPDATE`, or arrays. Commands run from the repo root with `DATABASE_URL` set in `api/.env`.

## Commands

- [ ] On an empty database, `cd api && uv run alembic upgrade head` → seven tables exist (`experiment`, `variable`, `trial`, `measurement`, `proposal`, `proposal_value`, `turn`) → AC-1
- [ ] `select indexname, indexdef from pg_indexes where schemaname = 'public'` → shows `uq_variable_experiment_name (experiment_id, lower(name))`, `uq_proposal_experiment_pending (experiment_id) WHERE status = 'pending'`, `ix_turn_experiment_id_id (experiment_id, id DESC)`, plus every unique and FK index in the spec's *Indexes and uniqueness* list → AC-1
- [ ] `select conname from pg_constraint where contype = 'c'` → 16 named CHECKs (`ck_<table>_<name>`); FK delete rules: cascade from experiment, trial, and proposal; set null for turn, proposal, and trial links; NO ACTION on `fk_measurement_variable_id` → AC-1, AC-11
- [ ] `uv run alembic downgrade base` → no app tables left; then `uv run alembic upgrade head` again succeeds → AC-1
- [ ] `select tablename, rowsecurity from pg_tables where schemaname = 'public'` → `true` for all seven (and `alembic_version`); `select count(*) from pg_policies where schemaname = 'public'` → 0 → AC-12
- [ ] `select has_table_privilege('anon', 'measurement', 'SELECT'), has_table_privilege('authenticated', 'experiment', 'INSERT')` → both false → AC-12
- [ ] With the Supabase anon key, `GET https://<project>.supabase.co/rest/v1/measurement` → no rows or a permission error; the API (as `postgres`) still reads and writes → AC-12
- [ ] `make seed` → prints "Seeded experiment N"; the experiment has 3 variables (Temperatura °C 20 to 100 with aliases `temp`, `T`; Duración min 0 to 180; Rendimiento % 0 to 100), trials 1 to 5 with 40/15/58, 45/15/64, 50/15/73, 55/15/80, 60/15/76, 15 measurements, 5 user turns, and 5 confirmed proposals → AC-13
- [ ] Every seeded measurement has `original_phrase` like "Ensayo 1: temperatura 40 grados, duración 15 minutos, rendimiento 58 por ciento", `source = 'text'`, and a non null `turn_id` → AC-13
- [ ] `make seed` a second time → still exactly one experiment with that title and 15 measurements → AC-13
- [ ] `ENV=prod make seed` → exits with "seed refuses to run with ENV=prod" and changes nothing → AC-13

## Lifecycle (repository calls, against the seeded experiment)

- [ ] `start_proposal(exp, 6)`, `add_turn` twice, `set_value` Temperatura 65 and Duración 20 from the two turns → no `trial` with number 6 and no `measurement` with that `proposal_id` → AC-2
- [ ] `confirm` it → `Confirmed(created_trial=True)`; trial 6 has exactly 2 measurements, each with value, the variable's unit, its turn's phrase, source, `said_at`, and `confirmed_at`; the proposal is `confirmed` with `resolved_at` and `confirmed_trial_id` set → AC-3, AC-9
- [ ] `confirm` the same proposal again → same `trial_id`, `created_trial=False`, no new rows → AC-4
- [ ] From 8 threads, `confirm` one pending proposal at once → one trial, one `created_trial=True`, every result has the same `trial_id` → AC-4
- [ ] `set_value` Rendimiento 63, then 73, on one card → one `proposal_value` row, value 73 → AC-5
- [ ] `start_proposal` while a card is pending → the old one is `superseded` with `resolved_at`; a raw `insert into proposal (experiment_id) values (<exp>)` fails on `uq_proposal_experiment_pending` → AC-6
- [ ] From 8 threads, `start_proposal` on the same experiment at once → no raw database error, exactly one pending card → AC-6
- [ ] A card for trial 3 with no target → `confirm` returns `trial_exists` with trial 3's id; the card stays `pending`; nothing saved → AC-8
- [ ] `set_trial(card, 99, target_trial_id=<trial 3>)` → `trial_number` becomes 3; `confirm` updates only Rendimiento in trial 3 and stamps its `edited_at`; the other measurements keep their values and a null `edited_at` → AC-7
- [ ] A correction that resends a value with the same value, unit, and phrase → `edited_at` stays null → AC-7
- [ ] A correction carrying a variable the trial lacks → a new measurement is added to that trial → AC-7
- [ ] `discard` a pending card → `discarded` with `resolved_at`, nothing saved; `confirm` or `discard` on it again → `not_pending`; `confirm` on a superseded card → `not_pending` → AC-10
- [ ] `confirm` a card with no values → `empty_proposal`; with values but no number and no target → `missing_trial_number` → AC-10
- [ ] `set_value` racing `confirm` on the same card → each `set_value` either lands before the confirm (and is saved) or returns `not_pending`; the saved measurements equal the card's values → AC-5
- [ ] Add 12 turns, then `last_turns(exp, 10)` → the 10 highest ids, oldest first → AC-14

## Constraints (raw SQL, each must fail)

- [ ] A second variable named `TEMPERATURA` in the same experiment → AC-11
- [ ] A variable with `min_value` 5 and `max_value` 1 → AC-11
- [ ] A trial with number 0 → AC-11
- [ ] A `proposal_value` or `measurement` with value `'NaN'`, `'Infinity'`, or `'-Infinity'` → AC-11
- [ ] An experiment status `archived`, a turn source `fax`, a turn role `system`, a user turn with no source → AC-11
- [ ] `delete from variable` for a variable that has measurements → fails → AC-11
- [ ] `delete from experiment` → its variables, trials, measurements, proposals, values, and turns are all gone → AC-11

## Value sourcing

- [ ] `set_value` from a **voice** user turn → `proposal_value.original_phrase`, `source`, `said_at` equal that turn's `text`, `source` (`voice`), and `created_at`, not the input or the time of the call
- [ ] `set_value` with an assistant turn, or a turn of another experiment → `invalid_turn`; a variable of another experiment → `variable_not_in_experiment`
- [ ] Change `variable.unit` after `set_value`, then `confirm` → the measurement keeps the unit snapshotted on the card, not the new one
- [ ] `set_value` stores `value` and `variable_id` exactly as passed (try 64.5)
- [ ] `start_proposal(exp, None)` then `set_trial(card, 7, None)` → `trial_number` 7; `set_trial` with a trial of another experiment → `trial_not_in_experiment`
- [ ] `confirm` → the trial's `number` is the card's `trial_number`; every measurement field comes from its `proposal_value`; `confirmed_at` is the confirm time
- [ ] A repeat `confirm` → `trial_id` comes from `proposal.confirmed_trial_id`, `created_trial=False`
- [ ] `last_turns` orders by `id`: insert a turn with an older `created_at` by hand → it still comes last
- [ ] `add_turn` stores the `source` it was given (`voice` or `text`); the route that picks it comes in feature 6
- [ ] `created_by` is a plain input (seed writes `seed`); the access gate supplies it in feature 5
- [ ] Every timestamp reads back as an aware UTC datetime (`tzinfo` is UTC)
- [ ] Seed values match the product doc's sample table exactly

## Fit for later

- [ ] `variable.min_value`, `variable.max_value`, `variable.required`, `measurement.edited_at`, and `experiment.status` exist; the cascades above hold; protocols would add a table only → AC-15

## Acceptance-criteria coverage

- AC-1: Commands 1 to 4 · AC-2: Lifecycle 1 · AC-3: Lifecycle 2 · AC-4: Lifecycle 3, 4 · AC-5: Lifecycle 5, 14 · AC-6: Lifecycle 6, 7 · AC-7: Lifecycle 9 to 11 · AC-8: Lifecycle 8 · AC-9: Lifecycle 2 · AC-10: Lifecycle 12, 13 · AC-11: Commands 3, Constraints · AC-12: Commands 5 to 7 · AC-13: Commands 8 to 11 · AC-14: Lifecycle 15 · AC-15: Fit for later
