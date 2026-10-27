# 0002. Data model: rationale

Build spec: [index.md](index.md).

## Context

LabFlow's promise is trust: no measurement is saved without an explicit confirm, every number reported comes from a database query that names its trial, and every record keeps its original phrase, source (voice or text), and time (product doc, Principio de confianza, RNF-05). The data model is where those promises either hold by construction or depend on every later feature remembering them.

The capture flow adds pressure. A card can build up across several sentences before you confirm it (RN-03). You can correct a value before saving without creating a duplicate (RF-06). A trial number that already exists has to trigger the question "correction or new trial?" (RN-02). And the confirm can arrive twice: a spoken "sí" and a button tap, or a retry after a slow network. The agent also needs the last turns of the conversation from Postgres to read each new sentence in context (spec 0001).

The constraints are a three person team and a demo on Friday Oct 30, 2026, on Supabase Postgres through SQLModel and Alembic (spec 0001). Features 5 to 12 all build on these tables. Releases 4 and later (range warnings, edits, "terminar", protocols) must fit without a breaking migration. Supabase serves tables in the `public` schema over its Data API, so whatever the schema is, it must not be readable from there.

Not deciding this blocks every Release 1 feature, and deciding it loosely means the "nothing before confirm" rule lives in scattered `WHERE` clauses.

## Options considered

### Option 1: Separate proposal tables, copied on confirm (chosen)

`proposal` (the card) and `proposal_value` (one row per variable) hold what the AI understood. Confirm copies the values into `trial` and `measurement` in one locked transaction. `measurement` holds only confirmed data.

**Pros**:
- A read of saved data cannot leak a proposal; there is nothing to filter.
- The proposal row is a natural lock target for an idempotent confirm, and keeps the history of discarded and superseded cards for later quality metrics.
- A trial exists only once something is confirmed, so the table never shows empty trials.

**Cons**:
- Two more tables, and the trace columns are copied from one to the other.
- The product doc's conceptual model (a `state` on each measurement) maps to it less literally.

### Option 2: Measurement rows with a state column

As in the product doc: `measurement.state` is `proposed` or `confirmed`, and confirm flips it.

**Pros**:
- Fewest tables; matches the conceptual model one to one.
- Confirm is a single `UPDATE`.

**Cons**:
- Every read of saved data (table, chart, five kinds of question, CSV, report) must filter `state = 'confirmed'`; one forgotten filter breaks the core promise in the demo.
- A proposal needs a trial row before the trial is confirmed, so empty or phantom trials appear unless filtered too.
- The unique "one value per variable per trial" rule clashes with a proposed value sitting beside a confirmed one during a correction.

### Option 3: One proposal row with a JSON blob

The card is one row with its values in `jsonb`; confirm parses it into trials and measurements.

**Pros**:
- The simplest write while dictating; no per value rows.

**Cons**:
- Values are not foreign keyed to variables, so a wrong variable id is caught late or never.
- Replacing one value means rewriting the blob, which races with dictation in parts.

## Rationale

Option 1 wins because the trust rule is the product, and it is cheaper to make that rule structural once than to enforce it in every reader. Option 2 is the simplest schema, but it moves the risk into features 7, 9, 10, 16, and 18, each written under demo pressure, each one filter away from showing an unconfirmed number. Option 3 saves a table but gives up foreign key integrity exactly where the LLM's output enters the database. The cost of Option 1 (two tables and copied trace columns) is small and fixed. The copy is also the honest model: the proposal is what the AI heard, the measurement is what you agreed to.

The supporting choices follow the same logic. Keeping discarded and superseded proposals costs nothing and is the only data the later quality monitoring would have. Copying the phrase, source, and time onto each measurement keeps the trace readable without joins and intact even if turns are trimmed. The `turn_id` link keeps the path back to the whole conversation. `double precision` keeps values as plain JSON numbers for Plotly and SQL aggregates; the exact words live in `original_phrase`. `bigint identity` keys follow the Supabase skill's default for a single database. Text plus CHECK beats native enums because Alembic does not autogenerate enum changes. RLS with no policies closes the Data API with one statement per table, while the API's `postgres` role bypasses it.

The calls made without a question, with the runner up for each:

- **Sync `Session` over `AsyncSession`.** The sqlmodel and fastapi skills default to sync sessions in `def` routes and dependencies (run in the threadpool), and SQLModel's async story is thinner. Feature 6's async route then runs DB calls in the threadpool. Runner up: `AsyncSession` with `psycopg` async, which is worth it only if the threadpool becomes a measured bottleneck.
- **`repositories/` for queries, `services/` for pure rules.** AGENTS.md wants I/O at the edges and functions pure by default. Spec 0001 already names a repositories layer. Putting queries there keeps `services/` pure and testable without a database. Runner up: queries in `services/`, one folder fewer but with I/O mixed into the rules.
- **Build the lifecycle here rather than in feature 6.** The scope row's done line ("confirming it makes it a saved measurement") is not checkable without it, and its correctness rests on schema details (the partial index, the upserts, the lock) designed here. Feature 6 then deals only with the LLM, the card, and the routes. Runner up: ship tables only and leave confirm to feature 6, which pushes the hardest invariant into the busiest feature.
- **The same experiment check in code, not composite foreign keys.** The lifecycle functions are the only writers, so one check in each covers every path. Composite keys would add `experiment_id` to `measurement` and `proposal_value` plus extra unique indexes on `trial` and `variable`. Runner up: composite foreign keys, the right move once a second writer exists.
- **Lock first, `INSERT … ON CONFLICT` as the backstop, over catching `IntegrityError`.** The cross check showed that the proposal lock plus one pending card per experiment already stops two confirms racing for one new trial number, and that `start_proposal` needed an experiment row lock to stop two card starts racing when none is pending. So locks do the serializing. `ON CONFLICT` remains as a single statement backstop with no savepoints and no exception for an expected outcome (AGENTS.md: expected failures are return values). Runner up: savepoints plus `IntegrityError` handling.
- **A hand written first migration.** Autogenerate does not reliably produce functional indexes (`lower(name)`), partial indexes, or RLS statements. Starting from its draft and editing by hand gets a correct, reviewable file. Runner up: pure autogenerate, plus a second migration for what it missed.
- **`ON DELETE NO ACTION` on `measurement.variable_id`.** This is a correction found while writing. The agreed rule was "refuse deleting a variable with measurements, but cascade an experiment delete". Postgres `RESTRICT` checks immediately and would block the experiment cascade. `NO ACTION` checks at the end of the statement, which allows the cascade through `trial` to finish first. Same behavior as agreed, different keyword.

One edge worth knowing: if a pending correction's `target_trial_id` trial is deleted (feature 14), the foreign key sets it to null, and confirm then treats the card as a new trial with its `trial_number`. Feature 14 should discard pending proposals that target a trial it deletes.
