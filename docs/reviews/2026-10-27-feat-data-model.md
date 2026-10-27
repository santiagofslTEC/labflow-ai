# Review, feat/data-model, 2026-10-27

**Reviewed by**: claude-sonnet-5-5 (author model not stated)
**Scope**: 34 files, branch vs main (merge base c159e0f; uncommitted edits included)
**Verdict**: Changes requested

## Summary
The change adds the seven-table schema, a hand-edited Alembic migration with RLS and revokes, a pure rules layer, typed results, the proposal lifecycle repositories, turns, and a seed script. The code follows AGENTS.md closely: typed results instead of exceptions, frozen result models, pure rules separated from I/O, constraints named and matched between models and migration. The headline issue is a lock-ordering flaw in `start_proposal` that can deadlock against `confirm` or overwrite a just-confirmed proposal with `superseded`. That is exactly the "start racing confirm" case the spec says is safe. No tests exist yet (`none-yet`); see Test coverage.

## Major
### 🟠 start_proposal can deadlock with confirm, or overwrite a confirmed card with "superseded", `api/app/repositories/proposals.py:38-67`
**Problem**: `start_proposal` takes `FOR UPDATE` on the experiment row (full lock), then reads the pending proposal with a plain SELECT (`get_pending`, no row lock) and flushes an UPDATE to `superseded`. Two interleavings follow.
1. Lost state. `confirm(P)` holds the lock on proposal P. `start_proposal` has already read P as pending, and its UPDATE blocks on P. When `confirm` commits, `start`'s UPDATE proceeds from its stale in-memory copy and writes `status=superseded`, `resolved_at`, `updated_at` over a `confirmed` row. The trial and measurements exist, but the proposal now says superseded and `confirmed_trial_id` is orphaned. A repeat confirm then returns `not_pending`, which breaks AC-4. The resolved CHECK still passes, so the database does not catch it.
2. Deadlock. `start` holds `FOR UPDATE` on the experiment and waits for P. `confirm` then inserts `trial` and `measurement`, whose FKs need `FOR KEY SHARE` on the experiment row, and that conflicts with `FOR UPDATE`. Postgres aborts one transaction with a raw `DeadlockDetected`, which becomes a 500.
**Why it matters**: A double tap, or a "sí" plus a new dictation, is the normal use case. The spec's Critical test scenarios explicitly list start/confirm races as safe. A silently wrong proposal status is the worst failure mode for a notebook that promises no invented data.
**Suggested fix**: Lock the experiment with `FOR NO KEY UPDATE` (SQLAlchemy `with_for_update(key_share=True)`) so FK checks from child inserts do not conflict. Make the pending-row read inside `start_proposal` also use `FOR UPDATE` with `populate_existing`, so status is re-read after any concurrent confirm or discard has committed. If it is no longer pending, skip the supersede. Update the spec text (Locking section and the "FOR UPDATE" invariant) to match. Add a two-thread test (start vs confirm) against real Postgres.

## Minor
### 🟡 Migration fails on a plain local Postgres (no `anon`/`authenticated` roles), `api/migrations/versions/20261027_8bab157c1289_data_model.py:~292-297`
**Problem**: `REVOKE ALL ... FROM anon, authenticated` errors with "role does not exist" outside Supabase. The spec says tests may run against "the Supabase dev project or a local one", and CI will need a Postgres service.
**Why it matters**: AC-1 cannot be run on a local or CI database without creating those roles by hand.
**Suggested fix**: Guard each revoke with an existence check (a DO block over `pg_roles`), or document that local databases must pre-create the roles. Also consider the identity sequences: Supabase default privileges grant them to the API roles, and `REVOKE ALL ON table` does not cover them. Low risk, but worth a deliberate decision.

### 🟡 Seed guard fails open: `ENV` defaults to "dev", `api/scripts/seed.py:91` and `api/app/core/settings.py:12`
**Problem**: `make seed` refuses only when `ENV=prod`. If `ENV` is unset on a machine pointed at the production `DATABASE_URL`, the guard passes and the script deletes the sample experiment and inserts data into prod.
**Why it matters**: The blast radius is limited to one titled experiment, but the guard gives false assurance.
**Suggested fix**: Also refuse unless `ENV` is explicitly `dev`, or key the guard off the target host. At minimum make `ENV` required (no default) so the value is always deliberate.

### 🟡 `preDeployCommand` uses `uv run`; confirm it works in the Railway runtime image, `api/railway.json:4`
**Problem**: The start command calls bare `uvicorn`, which suggests the venv is on PATH and `uv` may not be present or may try to re-sync at run time. I could not verify the builder's behavior from the repo.
**Why it matters**: A failing pre-deploy blocks every deploy (by design), so a wrong command takes down releases.
**Suggested fix**: Verify on a Railway preview deploy. If `uv` is not in the image, use `alembic upgrade head` directly, matching the start command's style.

### 🟡 Out-of-range input surfaces as a raw `IntegrityError` after the transaction has started, `api/app/repositories/proposals.py:69-75, 124-139`
**Problem**: `start_proposal(trial_number=0)` or `set_value(value=nan)` is not checked in code. The CHECK constraint raises after the supersede flush or the upsert. The transaction does roll back, so the data stays consistent, but the caller gets an exception for a plausible bad input rather than a typed result.
**Why it matters**: AGENTS.md says expected failures are values. Feature 6 will feed LLM output into these functions, and a bad number is an expected failure there.
**Suggested fix**: Validate at the router/Pydantic boundary in feature 6 (positive trial number, finite float), or add typed results here. Record the decision in the spec's follow-ups.

### 🟡 Scope file ticks do not match reality, `docs/scope/scope.md` (feature 3)
**Problem**: "Verify it: `/check verify data model`" is ticked while "Build it" and "Seed ... run it against the dev database (AC-13)" are not. The file is also uncommitted.
**Why it matters**: The scope is the project's source of progress truth, and `/sync` reconciles from it.
**Suggested fix**: Untick "Verify it" until the seed is run and verified, or tick the remaining items if they are done.

### 🟡 AGENTS.md folder rule does not list `repositories/`, `AGENTS.md` (Folders by layer)
**Problem**: The new layer is justified by spec 0002 and spec 0001, so this is documented drift, not a violation. The spec's own follow-up (add `repositories/` to the rule) is still open.
**Suggested fix**: Do it in `/sync` before merge so the rule and code agree.

## Nits
- ⚪ `api/app/repositories/proposals.py:234`, `assert` for a runtime invariant is stripped under `python -O`; fine here, but a typed branch or `# pyright` narrowing helper would be consistent with "no exceptions for flow".
- ⚪ `api/app/core/db.py:12`, `lru_cache` engine is module-level cached state; acceptable as a process singleton, but worth a one-line comment citing the exception to the "no module level mutable state" rule.
- ⚪ `api/app/models/proposal.py:33`, `trial_number: int | None = None` has no `sa_type`/Field while its siblings use builders; harmless, but inconsistent.
- ⚪ Hygiene: untracked Finder duplicates ("... 2" files, including `api/scripts 2/`, `docs/specs/0001-stack-architecture/* 2.md`, `web/src/app/* 2.*`, `.agents/skills/use-railway/references/* 2.md`) are in the working tree. Delete them and keep them out of `git add -A`.
- ⚪ `docs/scope/scope.md`, the new feature 19 sits out of order in the table; fine, but number-sorted reading is easier.

## Strengths
- Strong schema discipline: every CHECK, unique index, and FK delete rule from the spec exists in both the models and the migration with matching names. The NO ACTION vs RESTRICT subtlety on `measurement.variable_id` is explained at the right place.
- Clean functional split: `proposal_rules.py` is pure and takes loaded rows. Repositories hold only I/O. Results are frozen Pydantic models, with `rollback()` before every typed error return.
- The confirm upsert uses `IS DISTINCT FROM` on value, unit, and phrase so `edited_at` marks only real edits, and `ON CONFLICT` backstops the trial insert. The seed runs through the real lifecycle, which exercises the main path.
- RLS plus revokes, including `alembic_version`, and a complete `downgrade`. Env is validated at startup and `.env.example` is updated.

## Test coverage
`none-yet`: there is no pytest setup, and none of the lifecycle logic (confirm idempotency, `trial_exists`, supersede, correction with `edited_at`, constraints, migration up/down, RLS exposure) has automated coverage. The spec's Critical test scenarios require a real Postgres and two-thread races; the Major finding above is exactly what those race tests would catch. Run `/test` with a Postgres-backed fixture before merge or immediately after.
