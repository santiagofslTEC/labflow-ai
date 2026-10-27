# 0002. Data model for experiments, trials, and confirmed measurements

**Date**: 2026-10-27
**Status**: In Progress

## Summary

LabFlow keeps what the AI understood (a proposal) in its own tables, apart from what you confirmed (measurements). The trials table, the chart, and the answers read only confirmed data, so an unconfirmed value can never leak into them. Confirming copies the proposal into a trial and its measurements in one locked transaction. Each saved value keeps the sentence it came from, whether it was spoken or typed, and when. This feature ships seven Postgres tables, one migration, the proposal lifecycle functions (start, set a value, confirm, discard), the conversation history, and a seed script that loads the sample experiment.

## Requirements

**User stories**:
- As a student, I want what LabFlow understood to wait on a card until I confirm it, so that nothing wrong lands in my table.
- As a student, I want to dictate a trial in pieces and correct a value before saving, so that the card ends up right without duplicates.
- As a student, I want every saved value to keep the sentence I said, so that I can trace any number back to its source.
- As a research assistant, I want to fix values of a trial I already saved, so that the data stays correct without a second copy of the trial.
- As the team, we want the sample experiment loaded with one command, so that we can build the chart and questions before capture exists.

**Acceptance criteria** (the contract, each criterion is IDed and independently checkable):
- **AC-1**: On an empty dev database, `uv run alembic upgrade head` creates the seven tables (`experiment`, `variable`, `trial`, `measurement`, `proposal`, `proposal_value`, `turn`) with every column, constraint, and index in *Data model sketch*; `uv run alembic downgrade base` removes them all cleanly.
- **AC-2**: A pending proposal with values exists while no `trial` or `measurement` row exists for it; reading the `measurement` table for the experiment returns none of its values.
- **AC-3**: Confirming a pending proposal for a new trial number creates exactly one `trial` and one `measurement` per proposal value. Each measurement carries the value, the variable's unit, the original phrase, the source, `said_at`, and `confirmed_at`. The proposal becomes `confirmed` with `resolved_at` and `confirmed_trial_id` set.
- **AC-4**: Confirming the same proposal a second time, or twice at the same moment, returns the same trial and creates no extra rows.
- **AC-5**: Setting a value for a variable already on the pending proposal replaces it; a proposal never holds two values for the same variable.
- **AC-6**: An experiment has at most one pending proposal. Starting a new one marks the previous one `superseded` (with `resolved_at`) in the same transaction, and the database rejects a second pending row inserted directly.
- **AC-7**: A proposal with `target_trial_id` set (the user said it is a correction, RN-02) updates only the variables it carries in that trial, stamps `edited_at` on each updated measurement, adds measurements for variables the trial did not have yet, and leaves every other measurement untouched.
- **AC-8**: Confirming a proposal whose `trial_number` already exists in the experiment, with no `target_trial_id`, returns the typed result `trial_exists` (carrying that trial's id), saves nothing, and leaves the proposal `pending`.
- **AC-9**: A trial can be confirmed while required variables are still empty (partial trials are allowed; feature 15 reports the gaps).
- **AC-10**: Discarding a pending proposal marks it `discarded` with `resolved_at` and saves nothing. Confirm or discard on a proposal that is `discarded` or `superseded` returns `not_pending`. Confirm with no values returns `empty_proposal`. Confirm with no trial number and no target returns `missing_trial_number`.
- **AC-11**: The database rejects: two variable names in one experiment that differ only by case; `min_value` greater than `max_value`; a trial number of 0 or less; a value that is NaN or ±Infinity; a status, source, or role outside its allowed values. Deleting a variable that has measurements fails; deleting an experiment removes everything under it.
- **AC-12**: Every table has row level security (RLS, Postgres rules on which rows a role may see) enabled with no policies, and all privileges revoked from the `anon` and `authenticated` roles, so the Supabase Data API returns nothing for them, while the API (connected as the `postgres` role) still reads and writes.
- **AC-13**: `make seed` loads the sample experiment from the product doc (3 variables, trials 1 to 5 with the doc's values) through the proposal lifecycle, so every measurement has a phrase, source, and turn. Running it twice leaves exactly one copy. It refuses to run when `ENV=prod`.
- **AC-14**: Turns are stored with role, text, source, and time, and `last_turns(experiment_id, 10)` returns the latest 10 in the order they happened.
- **AC-15**: Later releases need no breaking change: ranges (feature 11) use the existing `min_value`/`max_value`; edits (feature 14) use `edited_at` and the cascades; "terminar" (feature 15) uses `experiment.status` and `variable.required`; protocols (feature 17) add a new table only.

## Decision

**Chosen option**: Option 1: Separate proposal tables, copied into trials and measurements on confirm.

Unconfirmed data lives only in `proposal` and `proposal_value`; `trial` and `measurement` hold only confirmed data, and the one confirm function is the only code that writes them.

**Implementation skills**: `sqlmodel` (`fastapi/sqlmodel`, `.claude/skills/sqlmodel/`) · `supabase-postgres-best-practices` (`supabase/agent-skills`, `.claude/skills/supabase-postgres-best-practices/`) · `fastapi` (`fastapi/fastapi`, `.claude/skills/fastapi/`)

**Calls made in this spec** (pick, then the runner up; reasoning in [rationale.md](rationale.md)):
- **Sync `Session` with `def` dependencies**, per the sqlmodel and fastapi skills. Runner up: SQLAlchemy `AsyncSession`.
- **Query code in `api/app/repositories/`** (functions that take an explicit `session`, as spec 0001 lays out), with the pure rules in `api/app/services/`. Runner up: queries inside `services/`.
- **The proposal lifecycle is built here, not in feature 6.** The scope's done line ("confirming makes it a saved measurement") needs it, and its invariants live in the schema. Feature 6 adds the LLM and the routes on top. Runner up: leave confirm to feature 6.
- **The same experiment check runs in code**, inside the lifecycle functions (the only writers). Runner up: composite foreign keys carrying `experiment_id`.
- **Race safety comes from row locks** (`SELECT ... FOR UPDATE` on the experiment in `start_proposal`, and on the proposal in every other mutating function), with `INSERT ... ON CONFLICT` as the single statement backstop for the new trial and the upserts. Runner up: catching `IntegrityError` inside savepoints.
- **The first migration is written by hand.** Use autogenerate as a draft, then hand edit, because autogenerate misses functional and partial indexes and RLS.

## Feature design

**Data model sketch**:

```
experiment 1──N variable
experiment 1──N trial     1──N measurement N──1 variable
experiment 1──N proposal  1──N proposal_value N──1 variable
experiment 1──N turn      (linked from measurement and proposal_value)
```

Every `id` is `bigint generated always as identity primary key`. Every timestamp is `timestamptz`, set in Python with `default_factory=lambda: datetime.now(UTC)` (SQLModel's `UTCDateTime`), and gets `server_default now()` in the migration for manual inserts. Enum like columns are `text` plus a named CHECK. Every foreign key column gets its own index unless a unique index already leads with it.

| Table | Column | Type | Null | Notes |
|---|---|---|---|---|
| **experiment** | `title` | text | no | CHECK length 1 to 200 |
| | `goal` | text | yes | |
| | `status` | text | no | `open` \| `closed`, default `open` |
| | `created_by` | text | no | access code holder name |
| | `created_at` | timestamptz | no | |
| **variable** | `experiment_id` | bigint | no | FK experiment, ON DELETE CASCADE |
| | `name` | text | no | CHECK length 1 to 80 |
| | `unit` | text | yes | canonical unit (`°C`, `min`, `%`); null for unitless (pH) |
| | `min_value`, `max_value` | double precision | yes | CHECK `min_value <= max_value` when both set |
| | `required` | boolean | no | default true |
| | `position` | smallint | no | column order, CHECK >= 0 |
| | `aliases` | text[] | no | default `'{}'`; other names fed to the LLM |
| | `created_at` | timestamptz | no | |
| **trial** | `experiment_id` | bigint | no | FK experiment, ON DELETE CASCADE |
| | `number` | integer | no | CHECK > 0 |
| | `created_at` | timestamptz | no | |
| **measurement** | `trial_id` | bigint | no | FK trial, ON DELETE CASCADE |
| | `variable_id` | bigint | no | FK variable, ON DELETE NO ACTION (see invariants) |
| | `value` | double precision | no | in the variable's unit; CHECK finite (no NaN, no ±Infinity) |
| | `unit` | text | yes | copied from `proposal_value.unit` at confirm |
| | `original_phrase` | text | no | the sentence the value came from |
| | `source` | text | no | `voice` \| `text` |
| | `said_at` | timestamptz | no | when that sentence was said |
| | `turn_id` | bigint | yes | FK turn, ON DELETE SET NULL |
| | `proposal_id` | bigint | yes | FK proposal, ON DELETE SET NULL; the proposal that last wrote it |
| | `confirmed_at` | timestamptz | no | first confirm |
| | `edited_at` | timestamptz | yes | set on every later update |
| **proposal** | `experiment_id` | bigint | no | FK experiment, ON DELETE CASCADE |
| | `status` | text | no | `pending` \| `confirmed` \| `discarded` \| `superseded`, default `pending` |
| | `trial_number` | integer | yes | CHECK > 0; null until dictated |
| | `target_trial_id` | bigint | yes | FK trial, ON DELETE SET NULL; set means "correct this trial" |
| | `confirmed_trial_id` | bigint | yes | FK trial, ON DELETE SET NULL; the trial confirm wrote |
| | `created_at`, `updated_at` | timestamptz | no | `updated_at` changes on every value or trial change |
| | `resolved_at` | timestamptz | yes | CHECK `(status = 'pending') = (resolved_at IS NULL)` |
| **proposal_value** | `proposal_id` | bigint | no | FK proposal, ON DELETE CASCADE |
| | `variable_id` | bigint | no | FK variable, ON DELETE CASCADE |
| | `value` | double precision | no | CHECK finite (no NaN, no ±Infinity) |
| | `unit` | text | yes | snapshot of `variable.unit` when the value is set |
| | `original_phrase` | text | no | copied from the turn |
| | `source` | text | no | `voice` \| `text`, copied from the turn |
| | `said_at` | timestamptz | no | the turn's `created_at` |
| | `turn_id` | bigint | yes | FK turn, ON DELETE SET NULL |
| **turn** | `experiment_id` | bigint | no | FK experiment, ON DELETE CASCADE |
| | `role` | text | no | `user` \| `assistant` |
| | `text` | text | no | |
| | `source` | text | yes | `voice` \| `text`; CHECK `(role = 'user') = (source IS NOT NULL)` |
| | `tool_name` | text | yes | the tool an assistant turn used |
| | `created_at` | timestamptz | no | |

Indexes and uniqueness:
- `variable`: unique `(experiment_id, lower(name))`.
- `trial`: unique `(experiment_id, number)`.
- `measurement`: unique `(trial_id, variable_id)`; index `(variable_id)`; index `(turn_id)`; index `(proposal_id)`.
- `proposal`: unique `(experiment_id) WHERE status = 'pending'`; index `(experiment_id, id)`; index `(target_trial_id)`; index `(confirmed_trial_id)`.
- `proposal_value`: unique `(proposal_id, variable_id)`; index `(variable_id)`; index `(turn_id)`.
- `turn`: index `(experiment_id, id DESC)`.

Python side: each table is a SQLModel class in `api/app/models/` (one module per table, all imported in `app/models/__init__.py` so Alembic sees them). The value sets are `StrEnum`s in `app/models/enums.py`: `ExperimentStatus`, `ProposalStatus`, `Source`, `Role`. `aliases` uses `Field(sa_column=Column(ARRAY(Text), nullable=False, server_default="{}"))`. Constraint names are lowercase and explicit (`ck_proposal_status`, `uq_variable_experiment_name`, and so on), so later migrations can drop them by name: every CHECK and index is declared with its `name=` in the model's `__table_args__`, and `app/models/__init__.py` sets `SQLModel.metadata.naming_convention` (`pk_%(table_name)s`, `fk_%(table_name)s_%(column_0_name)s`, `ix_%(table_name)s_%(column_0_name)s`, `uq_%(table_name)s_%(column_0_name)s`, `ck_%(table_name)s_%(constraint_name)s`) for anything left unnamed. The finite CHECK on both value columns is `value NOT IN ('NaN', 'Infinity', '-Infinity')`.

**State transitions**:

```
proposal:  pending ──confirm──▶ confirmed
           pending ──discard──▶ discarded
           pending ──start_proposal (a new card)──▶ superseded
           confirmed, discarded, superseded are final
experiment: open ──"terminar" (feature 15)──▶ closed
```

Confirming an already `confirmed` proposal is not a transition. It returns the stored result (AC-4).

**API surface**: this feature adds no HTTP routes; feature 5 (experiments) and feature 6 (capture) expose these. It ships repository functions. Each mutating function is one transaction that commits on success and rolls back on any typed error. Results are frozen Pydantic models in a union, never exceptions (AGENTS.md).

| Function (`api/app/repositories/`) | Key inputs | Key outputs | Auth | Typed errors |
|---|---|---|---|---|
| `turns.add_turn` | `session`, `experiment_id: int`, `role: Role`, `text: str`, `source: Source \| None`, `tool_name: str \| None` | `Turn` | the caller's route sits behind the access gate | `experiment_not_found` (a bad role/source pairing is a bug, the CHECK raises) |
| `turns.last_turns` | `session`, `experiment_id: int`, `limit: int = 10` | `list[Turn]`: the `limit` highest `id`s, returned in ascending `id` order | same | none |
| `proposals.get_pending` | `session`, `experiment_id: int` | `Proposal \| None` | same | none |
| `proposals.start_proposal` | `session`, `experiment_id: int`, `trial_number: int \| None` | `Proposal` (pending); the previous pending one becomes superseded | same | `experiment_not_found` |
| `proposals.set_trial` | `session`, `proposal_id: int`, `trial_number: int \| None`, `target_trial_id: int \| None` | `Proposal` | same | `proposal_not_found`, `not_pending`, `trial_not_in_experiment` |
| `proposals.set_value` | `session`, `proposal_id: int`, `variable_id: int`, `value: float`, `turn_id: int` | `ProposalValue` (upserted) | same | `proposal_not_found`, `not_pending`, `variable_not_in_experiment`, `invalid_turn` |
| `proposals.confirm` | `session`, `proposal_id: int` | `Confirmed(trial_id, created_trial: bool)` | same | `proposal_not_found`, `not_pending`, `empty_proposal`, `missing_trial_number`, `trial_exists(trial_id)` |
| `proposals.discard` | `session`, `proposal_id: int` | `Proposal` (discarded) | same | `proposal_not_found`, `not_pending` |

Locking (every mutating function that touches a proposal takes its lock before any check, so a `not_pending` answer is never stale):
- `start_proposal` first runs `SELECT … FROM experiment WHERE id = :id FOR UPDATE` (missing: `experiment_not_found`). This serializes card starts per experiment even when no card is pending, so the partial unique index never fires in normal use (it stays as the backstop). It then marks the current pending row `superseded` and inserts the new one.
- `set_trial`, `set_value`, `confirm`, `discard` start with `SELECT … FROM proposal WHERE id = :id FOR UPDATE`.
- `set_value` writes with `INSERT INTO proposal_value … ON CONFLICT (proposal_id, variable_id) DO UPDATE`, and sets `proposal.updated_at = now()` in the same transaction.
- `set_trial` with `target_trial_id` set ignores the passed `trial_number` and copies the target trial's `number` into `proposal.trial_number`, so the two never disagree. With `target_trial_id=None` it clears the target and stores the passed `trial_number`.

`confirm` runs, in one transaction:
1. `SELECT ... FOR UPDATE` on the proposal row. Missing: `proposal_not_found`.
2. Already `confirmed` with `confirmed_trial_id` set: return `Confirmed(confirmed_trial_id, created_trial=False)` with no writes. Already `confirmed` but `confirmed_trial_id` is null (its trial was deleted later), `discarded`, or `superseded`: `not_pending`.
3. Load its values. None: `empty_proposal`.
4. With `target_trial_id`: use that trial. Without it: no `trial_number` gives `missing_trial_number`. Otherwise run `INSERT INTO trial … ON CONFLICT (experiment_id, number) DO NOTHING RETURNING id`. If no row comes back, the trial exists: select its id, roll back, and return `trial_exists(that id)`. (With the proposal lock and one pending card per experiment, two confirms cannot race for the same new number in normal use, so `ON CONFLICT` is the backstop for a direct insert or a future second writer.)
5. For each value: `INSERT INTO measurement … ON CONFLICT (trial_id, variable_id) DO UPDATE SET value, unit, original_phrase, source, said_at, turn_id, proposal_id, edited_at = now() WHERE (measurement.value, measurement.unit, measurement.original_phrase) IS DISTINCT FROM (excluded.value, excluded.unit, excluded.original_phrase)`. A row whose value, unit, and phrase are unchanged is left alone, so `edited_at` only marks real edits. `confirmed_at` is set only on insert.
6. Set the proposal to `confirmed`, with `resolved_at = now()` and `confirmed_trial_id`. Commit.

Every typed error path calls `session.rollback()` before returning, so no transaction or lock stays open.

The pure rules live in `api/app/services/proposal_rules.py`: given the loaded rows, decide the next step or the typed error (steps 2 to 4). Repositories do only I/O.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| `set_value` | `original_phrase`, `source`, `said_at` | the `turn` row named by `turn_id` (`text`, `source`, `created_at`); it must be a `user` turn of the same experiment |
| `set_value` | `unit` | `variable.unit` at that moment (the LLM's normalized value is already in that unit, RN-01, owned by feature 6) |
| `set_value` | `value`, `variable_id` | input params (feature 6 gets them from the validated tool call) |
| `start_proposal` / `set_trial` | `trial_number` | input param (the dictated number, or null until the user says it) |
| `set_trial` | `target_trial_id` | input param, set by feature 6 when the user answers "corrección" (RN-02); must be a trial of the same experiment |
| `confirm` | trial `number` | `proposal.trial_number` |
| `confirm` | every measurement field, including `unit` | the matching `proposal_value` row (its `unit` was snapshotted from the variable at `set_value`); `confirmed_at`, `edited_at` from `now()` |
| `confirm` | `created_trial`, `trial_id` | `INSERT … RETURNING`, or `proposal.confirmed_trial_id` on a repeat confirm |
| `last_turns` | order | `turn.id` (identity, increases with each insert), not `created_at` |
| `add_turn` | `source` | the route that received the sentence: `/audio` gives `voice`, `/utterances` gives `text` (spec 0001) |
| experiment create (feature 5) | `created_by` | the access gate's holder name for the request (spec 0001); a route parameter, not a column default |
| any read | displayed times | stored in UTC; the browser formats them in its own local time zone |
| seed | all values | constants in `api/scripts/seed.py` taken from the product doc's sample table; every seed time is simply "now" when the script runs |

**Key invariants**:
- Only `proposals.confirm` inserts into `trial` or writes `measurement`; feature 14 (edit and delete) adds the only other writers. Nothing in feature 6 to 10 writes them.
- `measurement` contains only confirmed data, so every read of saved data (table, chart, questions) needs no state filter.
- One value per variable per trial, and one per variable per proposal (unique indexes).
- At most one `pending` proposal per experiment (partial unique index as the backstop); `start_proposal` locks the experiment row with `FOR UPDATE` before superseding, so two starts never race.
- A proposal with `target_trial_id` set has `trial_number` equal to that trial's `number` (`set_trial` copies it).
- Stored values are finite numbers (CHECK), so JSON and Plotly never see NaN or Infinity.
- `proposal.status = 'pending'` exactly when `resolved_at` is null (CHECK).
- A proposal's values, target trial, and turns all belong to the proposal's experiment (checked in the lifecycle functions, the only writers).
- `measurement.variable_id` uses `ON DELETE NO ACTION`, not `RESTRICT`. Both refuse a direct delete of a variable that has measurements. RESTRICT is checked right away, so it would also block deleting the whole experiment before the cascade through `trial` removes the measurements. NO ACTION is checked at the end of the statement.
- No audio, codes, or keys are stored in any table (RNF-08).

**Security model**: there are no user accounts. Every route that calls these functions sits behind the access code gate (spec 0001), and every holder sees every experiment; `created_by` records who made it, for traceability only. Data is fictitious lab data; the only personal data is the holder's name. The API connects as `postgres` through `DATABASE_URL`, which bypasses RLS; RLS is on with zero policies on all seven tables, so the Supabase anon and authenticated roles see nothing through the Data API. As a second lock, the migration also runs `REVOKE ALL ON <table> FROM anon, authenticated` for each table. No compliance scope applies.

**Configuration required**:
- `DATABASE_URL`: already named in spec 0001 (Supavisor session pooler, port 5432, `postgresql+psycopg://…?sslmode=require`). This feature makes it a required field in `app/core/settings.py`, so the API fails at startup without it, and uncomments it in `api/.env.example`. Railway needs it set before the first deploy that includes this feature.

**Critical test scenarios** (run against a real Postgres, the Supabase `dev` project or a local one; SQLite cannot check partial indexes, `FOR UPDATE`, or arrays):
- Happy path: seed, then start a proposal for trial 6, set two values from two turns, confirm. Trial 6 has two measurements with their phrases, and the proposal is confirmed. Verifies **AC-2**, **AC-3**, **AC-9**, **AC-13**, **AC-14**.
- Correction before save: set Rendimiento to 63, then to 73. The proposal has one value, 73. Verifies **AC-5**.
- Repeat and race: call `confirm` twice in a row, then from two threads at once; also call `start_proposal` from two threads at once with no card pending. One trial, no extra measurements, the same `trial_id` both times; exactly one pending card and no raw database error. Verifies **AC-4**, **AC-6**.
- Locked writes: `set_value` racing a `confirm` on the same card either lands before the confirm (and is saved) or returns `not_pending`, never a value on a confirmed card. Re-confirming a correction with unchanged values leaves `edited_at` null. Verifies **AC-5**, **AC-7**.
- Repeated trial: a proposal for trial 3 with no target returns `trial_exists` and stays pending. After `set_trial(target_trial_id=3's id)`, confirm updates only Rendimiento and stamps `edited_at`. Verifies **AC-7**, **AC-8**.
- Lifecycle errors: supersede on a new start, a direct second pending insert rejected, discard, confirm after discard, empty confirm, confirm with no number. Verifies **AC-6**, **AC-10**.
- Constraints: case only duplicate name, min greater than max, trial 0, NaN value, bad status, variable delete with measurements all rejected; experiment delete cascades. Verifies **AC-11**.
- Exposure: query a table with the Supabase anon key through the Data API and get no rows (or a permission error); `has_table_privilege('anon', 'measurement', 'SELECT')` is false; the API still reads. Verifies **AC-12**.
- Migration: `upgrade head`, `downgrade base`, `upgrade head` again on an empty database. Verifies **AC-1**.
- Fit for later: check the columns listed in AC-15 exist. Verifies **AC-15**.

## Build plan

Skateboard: one migration with the whole target model (it is small, and later releases depend on all of it), then the lifecycle that proves the confirm rule, then the seed that unblocks Release 3 work.

1. Add `sqlmodel>=0.0.45` (for `UTCDateTime`), `alembic`, and `psycopg[binary]` to `api/pyproject.toml`. Make `database_url` a required field in `Settings`. Add `api/app/core/db.py` with the engine (`pool_size=5, max_overflow=0, pool_pre_ping=True, pool_recycle=300`, per spec 0001), a `get_session` dependency that yields `Session(engine)`, and `SessionDep`. Uncomment `DATABASE_URL` in `api/.env.example`. Satisfies **AC-1**.
2. Write the enums and the seven SQLModel table classes in `api/app/models/` with the columns, CHECKs, foreign key delete rules, and named constraints from *Data model sketch*. Satisfies **AC-1**, **AC-11**, **AC-15**.
3. Set up Alembic in `api/` (`alembic.ini` with no URL, `env.py` reading `get_settings().database_url` with `target_metadata = SQLModel.metadata`, and `script.py.mako` importing `sqlmodel`). Write the first migration by hand from an autogenerate draft: add the `lower(name)` and partial unique indexes, `ALTER TABLE … ENABLE ROW LEVEL SECURITY` and `REVOKE ALL ON … FROM anon, authenticated` for all seven tables, `server_default now()` on timestamps, and a full `downgrade`. Add `"preDeployCommand": "uv run alembic upgrade head"` to `api/railway.json` and a `migrate` target to the `Makefile`. Satisfies **AC-1**, **AC-11**, **AC-12**, **AC-15**.
4. Write `api/app/services/proposal_rules.py` (pure rules) and the frozen result models (`Confirmed` and the error union with the codes from the API surface table). Satisfies **AC-4**, **AC-8**, **AC-10**.
5. Write `api/app/repositories/turns.py` and `api/app/repositories/proposals.py` (`get_pending`, `start_proposal`, `set_trial`, `set_value`, `confirm`, `discard`) with the locking, `ON CONFLICT`, and rollback rules from *API surface*. Satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9**, **AC-10**, **AC-14**.
6. Write `api/scripts/seed.py` and a `make seed` target. It refuses when `ENV=prod`, deletes any experiment titled `Ejemplo: rendimiento vs. temperatura` (cascade), then creates it with Temperatura (°C, 20 to 100, aliases `temp`, `T`), Duración (min, 0 to 180), and Rendimiento (%, 0 to 100), all required. For each trial 1 to 5, in order, it adds one user turn with source `text` ("Ensayo 1: temperatura 40 grados, duración 15 minutos, rendimiento 58 por ciento", and so on), calls `start_proposal(trial_number=n)`, then `set_value` three times with that same turn, then `confirm`, before moving to the next trial. Seed times are all "now". `created_by` is `seed`. Satisfies **AC-13**.
7. Run `make migrate` and `make seed` against the Supabase `dev` project, then `make check`. Satisfies **AC-1**, **AC-12**, **AC-13**.

## Consequences

**Positive**:
- The trust rule ("nothing in the table before you confirm") holds by structure, not by every query remembering a filter.
- Confirm is idempotent and safe under races, so a double tap or a spoken "sí" plus a click saves once.
- Every saved number traces to a sentence, a source, and a time, and links back to the conversation.
- Features 11, 14, 15 need no migration, and 17 adds a table; the sample experiment lets Release 3 start right away.

**Negative / tradeoffs**:
- Confirmed data is copied from `proposal_value` into `measurement`, so the trace columns exist twice (by design: the proposal is history, the measurement is the record).
- An update through a correction overwrites the old value; only `edited_at` and the old proposal row show it changed. A full edit history needs a revision table later.
- The same experiment rule lives in code, not the schema; a future second writer must call the lifecycle functions or repeat the check.
- Sync sessions mean async routes (feature 6, which awaits the LLM) must run DB calls in the threadpool, not inline in the event loop.
- The partial index, the functional index, and RLS are hand edited in the migration; autogenerate in later migrations may try to drop them and must be reviewed.
- Hard deletes are final; nothing restores a deleted trial.

**Neutral**:
- Adds an `api/app/repositories/` layer (spec 0001's layout) that the AGENTS.md folder rule does not list yet.
- Tests need a real Postgres; `/test` picks the setup.
- Railway now runs the migration before each deploy; a failing migration blocks the deploy instead of breaking a live API.

## Follow-up

- [x] The access code gate from spec 0001 is not built yet; feature 5 needs its holder name for `created_by`. Enrolled as scope feature 19 (Access code gate).
- [ ] Add `repositories/` to the AGENTS.md folder rule (`api/app/{routers,models,services,repositories,core}/`) once built (`/sync`).
- [ ] Feature 6 decides how the card tells the user a pending card was superseded, and runs these sync DB calls from its async route (threadpool or Asyncer).
- [ ] Feature 14 decides whether edits need a `measurement_revision` table with old values.
- [ ] Feature 15 decides whether a `closed` experiment refuses new turns and proposals (an `experiment_closed` result in `start_proposal` and `add_turn`); until then the status is shown, not enforced.
- [ ] Review every later autogenerated migration so it does not drop the hand written indexes or RLS.
- [ ] Switch the same experiment check to composite foreign keys if a second writer of `measurement` ever appears.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
