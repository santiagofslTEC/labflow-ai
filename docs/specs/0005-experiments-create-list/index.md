# 0005. Notebooks: create, list, and open

**Date**: 2026-10-28
**Status**: In Progress

## Summary

This feature lets you make a notebook (an experiment with a title, an optional goal, and 1 to 12 variables), see all notebooks in a list and in the sidebar, and open one again after a reload with everything intact. It adds three API routes on the tables spec 0002 already created, so there is no migration. The web side gets its first real data layer (TanStack Query, the cache that keeps the list and the sidebar in sync) and three screens under `/cuadernos`. Users always see the word "cuaderno"; the API and database keep "experiment".

## Requirements

**User stories**:
- As a student starting a lab session, I want to set up a notebook with the variables I will measure, so that LabFlow knows what data to expect.
- As a student coming back later, I want to find my notebook in a list and open it with its variables intact, so that I can pick up where I left off.
- As a student switching between experiments, I want my recent notebooks in the sidebar, so that any notebook is one tap away.

**Acceptance criteria**:
- **AC-1**: `/cuadernos` ("Mis cuadernos", serif page title) lists every notebook as one hairline row: the title on top, and under it a quiet meta line `{activity} · {n} ensayos` ("1 ensayo" for one, "sin ensayos" for zero), where activity is `formatRelative(last_activity_at)` (never empty: a notebook with no activity falls back to its `created_at`, AC-14). A closed notebook adds a soft sentence case "Cerrado" pill; open notebooks show no pill. Rows are ordered by `last_activity_at` newest first, ties by higher `id`. The whole row is a link to `/cuadernos/{id}`. An ink "Nuevo cuaderno" button at the top right links to `/cuadernos/nuevo`.
- **AC-2**: While the list loads, `/cuadernos` shows three skeleton rows. With no notebooks it shows an `EmptyState` ("Crea tu primer cuaderno", a button to `/cuadernos/nuevo`). If the request fails with no data loaded it reads "No pudimos cargar tus cuadernos" with a Reintentar button (it calls the query's `refetch()`), and the empty state is never shown for a failed load. The list refetches when the tab regains focus; if a background refetch fails while data is already shown, the data stays and no error appears.
- **AC-3**: `/cuadernos/nuevo` ("Nuevo cuaderno") is a full page, one column (640px max) form: Título (required), Objetivo (opcional, multi line), and a Variables table that starts with one empty row. Each row has Nombre, Unidad, Mín, Máx, a Requerida checkbox (checked by default), and a remove button (disabled while only one row is left). "Agregar variable" adds an empty row at the end; at 12 rows it is disabled with the hint "Máximo 12 variables". The column order of the notebook is the row order. There is no reordering and no aliases field. Cancelar and Crear cuaderno sit at the bottom.
- **AC-4**: Unidad is a free text input (at most 20 characters) with native suggestions (`<datalist>`): `°C`, `K`, `min`, `h`, `s`, `%`, `g`, `mg`, `mL`, `L`, `mol/L`, `M`, `kPa`, `bar`, `rpm`. Blank means unitless (stored as null). Mín and Máx are text inputs with `inputmode="decimal"` read by the existing `parseDecimal` (`web/src/lib/format.ts`): an optional minus sign, digits, and at most one comma or point as the decimal mark (`73,5` and `73.5` are both 73.5; `-273` is allowed; `.5`, `1e3`, and `1.000,5` are not). Each is optional and either may be set alone.
- **AC-5**: Pressing Crear cuaderno first runs `validateExperimentForm` in the browser and blocks the request on any error, showing each message under its field and moving focus to the first invalid field. The rules: title 1 to 200 characters after trimming; goal at most 1000; 1 to 12 variables; each name 1 to 80 after trimming; no two names equal after `trim()` and `toLowerCase()` ("Hay otra variable con este nombre"); unit at most 20; Mín and Máx must parse as finite numbers ("Escribe un número, por ejemplo 20 o 20,5"); when both are set, Mín ≤ Máx ("El mínimo no puede ser mayor que el máximo").
- **AC-6**: While the form equals its initial state (`isPristine`: empty title and goal, one empty row with Requerida checked), a quiet ghost button "Usar ejemplo" fills it with the sample experiment: title "Rendimiento vs temperatura", goal "Ver cómo la temperatura cambia el rendimiento de la reacción.", and three variables: Temperatura `°C` 20 to 100, Duración `min` 0 to 180, Rendimiento `%` 0 to 100, all required (the same ranges as `api/scripts/seed.py`). It only fills the form; nothing is sent until Crear cuaderno. Whenever the form differs from its initial state the button is hidden; clearing everything back to the initial state shows it again.
- **AC-7**: A valid form sends `POST /api/experiments`. While it is in flight, Crear cuaderno shows a spinner and is `aria-disabled`, so a double click cannot create two notebooks. On 201 the response is written into the `["experiments", id]` cache (`setQueryData`), the `["experiments"]` list is invalidated, and the browser goes to `/cuadernos/{id}`, which renders at once with no skeleton; the new notebook appears in the sidebar and in `/cuadernos` without a reload. Mutations never retry, so a failed create is never sent twice.
- **AC-8**: If the create fails, the form keeps everything typed. A 422 shows the response's Spanish `message` in an alert above the buttons. A network error or 5xx shows "No pudimos crear el cuaderno. Inténtalo de nuevo." A 401 sends the browser to `/access` (feature 19's `redirectOnUnauthorized` middleware, already on the `openapi-fetch` client), and the leave warning (AC-9) is skipped for that redirect.
- **AC-9**: When the form differs from its initial state, leaving it asks first: closing or reloading the tab triggers the browser's `beforeunload` prompt, and Cancelar or a click on any same origin link (caught by a click listener on `document` in the capture phase, active only while the form is dirty) opens a confirm ("¿Salir sin crear el cuaderno? Se perderá lo que escribiste."). The browser's Back and Forward buttons are not intercepted (accepted gap). An untouched form, a successful create, or a 401 redirect never asks.
- **AC-10**: `/cuadernos/{id}` shows a back link "Mis cuadernos", the title (serif), the goal when set, and a meta line `Creado por {created_by} · {created_at as "28 oct"} · {Abierto | Cerrado}`. Below, a "Variables" `PanelHeading` with the count lists each variable in `position` order: name, unit in Geist Mono (or "—" when unitless), range ("20 a 100", "≥ 0" with only Mín, "≤ 100" with only Máx, "—" with none), and "Requerida" or "Opcional". Below that, an "Ensayos" `PanelHeading` with an `EmptyState` "Aún no hay ensayos" holds the place where feature 7 adds the table. After a reload the page shows the same notebook with every variable intact. No "Dictar aquí" link yet (feature 20 adds it).
- **AC-11**: On `/cuadernos/{id}`, loading shows a skeleton title and three skeleton variable rows; a failed request shows "No pudimos cargar este cuaderno" with Reintentar; an unknown id (API 404) or a non integer id (checked in the browser, with no request sent) shows an `EmptyState` "Este cuaderno no existe" with a "Ver mis cuadernos" button, inside the app shell (the sidebar stays).
- **AC-12**: The sidebar section heading reads "Cuadernos" and lists the 5 notebooks with the newest activity (the same cached list as AC-1, sliced to 5), each linking to its page; on `/cuadernos/{id}` the matching entry is highlighted with `aria-current="page"` (when the open notebook is not among those 5, nothing is highlighted and the list is not changed). A "Ver todos" link goes to `/cuadernos`. With no notebooks it reads "Aún no hay cuadernos" with a "Nuevo cuaderno" link. While loading it shows two skeleton lines; on error it shows nothing but the "Ver todos" link. The phone menu (`MobileNav`) shows the same section.
- **AC-13**: The home page (`/`) points at notebooks: its empty state button goes to `/cuadernos/nuevo`, and the old "Experimentos" placeholder is replaced by a link to Mis cuadernos. Every screen this feature touches says "cuaderno", never "experimento".
- **AC-14**: `GET /api/experiments` returns `[{ id, title, status, trial_count, last_activity_at }]` ordered by `last_activity_at` desc, then `id` desc, at most 200 rows. `status` is the `ExperimentStatus` enum (`open` | `closed`, a literal union in the OpenAPI types); `last_activity_at` is a UTC ISO 8601 timestamp. `trial_count` counts the notebook's `trial` rows; `last_activity_at` is the greatest of `experiment.created_at`, max `turn.created_at`, max `measurement.confirmed_at`, and max `measurement.edited_at` (spec 0004), computed with `GREATEST` (which skips nulls, and `created_at` is never null) over grouped subqueries joined by `experiment_id` (measurements reach it through `trial`), so no join multiplies the counts.
- **AC-15**: `POST /api/experiments` with `{ title, goal, variables: [{ name, unit, min_value, max_value, required }] }` trims the strings (Pydantic strips whitespace before checking lengths, so a whitespace only title or name fails), turns a blank goal or unit into null, stores the notebook with `status = open`, `created_by` = the access gate holder, and one `variable` row per item with `position` 0, 1, 2… in request order and `aliases` left to its DB default (an empty array), all in one transaction, then reads it back with `get_experiment` and returns 201 with the notebook as in AC-16 (no `Location` header). A body that breaks a shape or length rule (AC-5's limits; NaN or infinity in a range) returns 422 `invalid_request` from the existing validation handler; two names equal after `strip()` and `lower()` return 422 `duplicate_variable_name` ("Hay dos variables llamadas «{name}». Cambia una."); if only the DB unique index catches it (a case fold Python and Postgres disagree on), the same code returns with the generic message "Hay dos variables con el mismo nombre."; Mín above Máx returns 422 `invalid_range` ("En «{name}», el mínimo no puede ser mayor que el máximo."). On any error nothing is stored.
- **AC-16**: `GET /api/experiments/{id}` returns `{ id, title, goal, status, created_by, created_at, variables: [{ id, name, unit, min_value, max_value, required, position }] }` with variables in `position` order; an unknown id returns 404 `experiment_not_found` ("Este cuaderno no existe."); a non integer id returns 422 `invalid_request`.
- **AC-17**: All three routes sit behind the access gate: without a valid session they return 401 `unauthorized` (feature 19).
- **AC-18**: Accessibility and phone: every variable field has a label that names its row ("Nombre, variable 2"); "Agregar variable" moves focus to the new row's Nombre; removing a row moves focus to the previous row's Nombre (or to "Agregar variable" when it was the first). Validation messages are tied to their fields with `aria-describedby`. Below 640px each variable row stacks into a block (Nombre and Unidad on one line, Mín, Máx and Requerida on the next). From 320px to 1920px no page scrolls sideways, and vitest-axe reports no violations on the list, the form (empty and with errors), and the notebook page.

## Decision

**Chosen option**: Option 1: Browser rendered pages on a shared TanStack Query cache, with a full page form

Three API routes over spec 0002's existing tables, and three client rendered pages under `/cuadernos` that read through one cached experiments query, with the form's state in a typed reducer and a pure validator.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no new tables, columns, or migration. This feature writes two tables from spec 0002 and reads three more.

| Table | Column | Written as | Rule |
|---|---|---|---|
| `experiment` | `title` | trimmed input | 1 to 200 (DB CHECK) |
| | `goal` | trimmed input, blank → null | at most 1000 (API only, no DB check) |
| | `status` | `open` | DB default |
| | `created_by` | access gate holder | not null |
| | `created_at` | now | |
| `variable` (N:1 experiment, cascade) | `name` | trimmed input | 1 to 80 (DB CHECK); unique per experiment ignoring case (`uq_variable_experiment_name` on `lower(name)`) |
| | `unit` | trimmed input, blank → null | at most 20 (API only) |
| | `min_value`, `max_value` | input or null | finite; `min_value <= max_value` when both set (DB CHECK) |
| | `required` | input | default true |
| | `position` | index in the request list | 0 to 11 |
| | `aliases` | not set (empty array) | DB default `'{}'` |

The list reads `trial` (count), `turn.created_at`, and `measurement.confirmed_at` and `edited_at` (for `last_activity_at`).

**State transitions**: none added. Every notebook is created `open`; `open → closed` belongs to feature 15. The form itself has a client state: `empty` (Usar ejemplo visible, no leave warning) ⇄ `dirty` (leave warning on; back to `empty` when cleared to the initial state) → `submitting` (Crear aria-disabled) → `created` (navigates away) or back to `dirty` with an error alert.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/experiments` | GET | none | `[{ id, title, status, trial_count, last_activity_at }]`, newest activity first, max 200 | access session | 401 `unauthorized` |
| `/api/experiments` | POST | `title`: str (req, 1 to 200) · `goal`: str \| null (opt, ≤ 1000) · `variables`: list (req, 1 to 12) of `{ name`: str (1 to 80) · `unit`: str \| null (≤ 20) · `min_value`, `max_value`: float \| null (finite) · `required`: bool (default true) `}` | 201, the notebook detail (as GET by id) | access session | 422 `invalid_request`, 422 `duplicate_variable_name`, 422 `invalid_range`, 401 |
| `/api/experiments/{id}` | GET | `id`: int (path) | `{ id, title, goal, status, created_by, created_at, variables: [{ id, name, unit, min_value, max_value, required, position }] }` | access session | 404 `experiment_not_found`, 401 |

Layering (AGENTS.md): `api/app/routers/experiments.py` holds the frozen Pydantic request and response models and maps typed results to `ApiError`. `api/app/services/experiment_rules.py` holds the pure `check_new_experiment(body) -> DuplicateVariableName | InvalidRange | None`. `api/app/repositories/experiments.py` holds `list_summaries(session, limit=200)` (one SQL statement with grouped subqueries for the count and the activity max), `create_experiment(session, holder, body) -> ExperimentDetail | DuplicateVariableName` (one transaction; an `IntegrityError` on `uq_variable_experiment_name` rolls back and returns `DuplicateVariableName(name=None)`, the backstop for anything the pure check missed, which the router turns into the generic message), and `get_experiment(session, id) -> ExperimentDetail | ExperimentNotFound`. The routes use `HolderDep` and `SessionDep`. Run `make openapi` after adding them.

**Web structure**:
- `web/src/app/providers.tsx`: a `QueryClientProvider` (one client per browser session, created with `useState`, `defaultOptions.queries`: `refetchOnWindowFocus: true`, `retry: 1`; mutations keep the library default of no retry), mounted in the `(app)` layout. Adds `@tanstack/react-query`.
- `web/src/api/experiments.ts`: the query keys (`["experiments"]`, `["experiments", id]`) and the fetchers on the existing `openapi-fetch` client, each returning a result union (`{ ok: true, data } | { ok: false, error }`) that the hooks turn into query errors.
- `web/src/hooks/use-experiments.ts`: `useExperiments()`, `useExperiment(id)`, `useCreateExperiment()` (on success: `setQueryData(["experiments", id], response)` and invalidate `["experiments"]`).
- `web/src/lib/experiment-form.ts`: the form state type, `formReducer` (add row, remove row, set field, fill example, reset), `isPristine` (deep equal to the initial state), `validateExperimentForm` (pure, returns `{ fieldPath: message }`), and `toCreateBody` (trims, parses decimals, blank → null). Decimals go through the existing `parseDecimal` in `web/src/lib/format.ts` (blank is checked first and means null); do not add a second parser.
- `web/src/lib/relative-time.ts`: `formatRelative(date, now)` on `Intl.RelativeTimeFormat("es", { numeric: "auto" })`: under a minute, or in the future (clock skew), "ahora"; then minutes, hours, "ayer", days up to 6; a week or older as `12 oct` (`Intl.DateTimeFormat("es", { day: "numeric", month: "short" })`, adding the year when it differs from now's).
- Pages under `web/src/app/(app)/cuadernos/`: `page.tsx` (list), `nuevo/page.tsx` (form), `[id]/page.tsx` (notebook). Each page that reads data is a client component; read the Next.js 16 docs in `node_modules/next/dist/docs/` for route params before writing them (web/AGENTS.md).
- The sidebar and `MobileNav` section in `web/src/components/app-shell/` read `useExperiments()`.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| List row | title, status, id | `experiment.title`, `experiment.status`, `experiment.id` |
| List row | trial count | `count(trial)` for the experiment, in `list_summaries` |
| List row | activity text | `formatRelative(last_activity_at, now)`; `last_activity_at` derived as in AC-14; `now` = the browser clock when the row renders |
| List, sidebar | order | `last_activity_at` desc, `id` desc, from the API (the browser never resorts) |
| Sidebar | which 5 | the first 5 of the cached `["experiments"]` list |
| Sidebar | highlighted entry | the `id` route param when on `/cuadernos/{id}` |
| Create | `created_by` | `HolderDep` (feature 19), never the body |
| Create | `status`, `aliases`, `created_at` | DB defaults (`open`, `{}`, now) |
| Create | `position` | index of the variable in the request list (the form's row order) |
| Create | `unit`, `goal` null | blank or whitespace only after trimming |
| Create | `min_value`, `max_value` | `parseDecimal` (`lib/format.ts`) of the field text in the browser; JSON numbers to the API |
| Create | duplicate name check | browser: `trim().toLowerCase()`; API: `strip().lower()`; backstop: the DB index on `lower(name)` |
| List row | "sin ensayos" / "1 ensayo" / "{n} ensayos" | `trial_count` |
| Usar ejemplo | title, goal, variables, ranges | constants in `experiment-form.ts`, matching `api/scripts/seed.py` |
| Notebook page | all fields | `GET /api/experiments/{id}` |
| Notebook page | created date | `created_at` as `Intl.DateTimeFormat("es", { day: "numeric", month: "short" })` in the browser's time zone, with the year when not the current year |
| Notebook page | range text | `min_value`, `max_value` through `formatQuantity` (spec 0003): both → "{min} a {max}", min only → "≥ {min}", max only → "≤ {max}", none → "—" |
| Errors | Spanish messages | the API `message` (422), fixed client strings for network, 5xx, and validation |

**Key invariants**:
- A notebook always has 1 to 12 variables, all created in the same transaction; a failed create leaves no partial rows.
- Variable names are unique per notebook ignoring case (DB unique index, plus the pure check for a friendly message).
- `position` values of a notebook are exactly 0 to n-1, in the order the user entered them.
- `created_by` comes only from the session; a body field with that name is ignored (Pydantic models forbid extra fields).
- The browser never computes list order or trial counts; the API is the source of truth.
- The client validator and the Pydantic model enforce the same limits (title 200, goal 1000, name 80, unit 20, 1 to 12 variables); a test asserts the shared numbers.

**Security model**: every route is behind the access gate (feature 19); without a session they return 401. There are no accounts, and every code holder sees and opens every notebook (spec 0002); `created_by` is for traceability only. The only personal data is the holder's name. Text fields are rendered as text (React escapes them), never as HTML. No rate limit beyond the gate: only code holders can reach these routes. No compliance scope applies.

**Configuration required**: none. No new environment variables or credentials.

**Observability**: the create route logs `experiment created` at INFO with `experiment_id`, `holder`, and `variable_count` (never the title or goal text). Failures to create log at WARNING with the error code.

**Critical test scenarios**:
- Happy path: press Usar ejemplo, then Crear cuaderno → you land on the new notebook's page with 3 variables; reload, it is intact; it appears first in `/cuadernos` and in the sidebar, verifies **AC-6**, **AC-7**, **AC-10**, **AC-12**, **AC-15**, **AC-16**
- Validation: two variables "Temperatura" and " temperatura " → the client blocks with "Hay otra variable con este nombre"; the same body sent straight to the API returns 422 `duplicate_variable_name` and stores nothing, verifies **AC-5**, **AC-15**
- Decimals: Mín "20,5", Máx "80" stores 20.5 and 80; Mín "abc" is blocked; Mín 90, Máx 80 is blocked on the client and returns 422 `invalid_range` from the API, verifies **AC-4**, **AC-5**, **AC-15**
- Failure: the API is down when you press Crear → the alert shows and every typed value stays, verifies **AC-8**
- Ordering: a notebook with a confirmed measurement just now outranks a newer but untouched one, verifies **AC-1**, **AC-14**
- Unknown id: `/cuadernos/999999` and `/cuadernos/abc` show "Este cuaderno no existe" inside the shell; the API returns 404 for 999999, verifies **AC-11**, **AC-16**
- Auth/permission: each route without a cookie returns 401 `unauthorized`, verifies **AC-17**

## Build plan

Skateboard: first make the thinnest usable whole (create a notebook and open it again), then grow it into the list, the sidebar, and the home link, then polish for phone and accessibility.

1. API: `services/experiment_rules.py` (`check_new_experiment`), `repositories/experiments.py` (`create_experiment`, `get_experiment`, `list_summaries`), `routers/experiments.py` with the three routes and their models, mounted in `main.py`; pytest with `TestClient` for create (happy, duplicate name, invalid range, whitespace only title, NaN sent as a raw JSON body because `TestClient(json=...)` cannot encode it, 13 variables, rollback on the unique backstop), detail (found, 404, non integer id 422), list (order by activity, trial count, empty), and 401 on all three; `make openapi`, satisfies **AC-14**, **AC-15**, **AC-16**, **AC-17**
2. Web data layer: add `@tanstack/react-query`, the provider in the `(app)` layout, `api/experiments.ts`, and the three hooks, satisfies **AC-2**, **AC-7**, **AC-14**
3. Web: `lib/experiment-form.ts` (reducer, `isPristine`, `validateExperimentForm`, `toCreateBody`, example constants) with Vitest unit tests, then `/cuadernos/nuevo` with the variables table, datalist, Usar ejemplo, submit states, error alerts, and the leave warning, satisfies **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9**
4. Web: `/cuadernos/[id]` with its loading, error, and not found states, satisfies **AC-10**, **AC-11**
5. Web: `lib/relative-time.ts` with tests, `/cuadernos` with its states, the sidebar and `MobileNav` section, and the home page links and "cuaderno" wording, satisfies **AC-1**, **AC-2**, **AC-12**, **AC-13**
6. Web: phone and accessibility pass (row labels, focus moves on add and remove, stacked rows below 640px, 320px to 1920px with no sideways scroll, vitest-axe on list, form, and notebook page), satisfies **AC-18**

## Consequences

**Positive**:
- The core Release 1 loop has a home: you can make a notebook, find it, and reopen it, which features 6, 7, and 20 build on.
- One cached list feeds the sidebar, the list page, and later the push to talk picker (spec 0004), so they never disagree.
- No migration, so nothing in the database changes and nothing can break the data spec 0002 verified.

**Negative / tradeoffs**:
- No editing: a typo in a title or a wrong unit means making a new notebook. Fine for the demo; real users will ask for it soon.
- Pages render in the browser, so each first visit shows a skeleton before content, and nothing is indexed (fine behind an access gate).
- The validation limits live in two places (Pydantic and `validateExperimentForm`); a test pins them, but a change must touch both.
- The list is capped at 200 with no pagination. That is far beyond a class project, but a real lab group would eventually need paging or search.
- The native `datalist` dropdown looks different in each browser and cannot follow `design.md`.

**Neutral**:
- `@tanstack/react-query` becomes the web app's data layer; later features add queries next to `["experiments"]`.
- The `GET /api/experiments` shape grows two fields (`status`, `trial_count`) beyond spec 0004's table; the change only adds fields.
- The home page keeps its greeting until feature 20 replaces `/`; spec 0004's note about moving it to `/cuadernos` with feature 5 no longer applies.

## Follow-up

- [ ] Spec 0004: update its `/api/experiments` row to the AC-14 shape and drop the note that feature 5 moves the home content to `/cuadernos` (now: `/` links to notebooks until feature 20 replaces it).
- [ ] pytest is not configured in `api/` yet; set it up (via `/test` or `/develop tooling`) before or as part of build task 1.
- [ ] Editing a notebook (title, goal, then variables with rules for ones that already have measurements) needs its own decision before real use.
- [ ] Feature 6 decides whether variable aliases help extraction; if so, add an aliases field to this form then.
- [ ] The list stops at 200 rows without telling the user; add a truncation flag or paging before real use.
