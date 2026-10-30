# 0007. Trials table, recent measurements, and CSV export

**Date**: 2026-10-29
**Status**: In Progress

## Summary

The notebook's side panel (the "Inspector activo") already draws a trials table, a "Mediciones recientes" list, and an "Exportar CSV" action, but none of them reads saved data: the table shows only its header, the list always says "Aún no hay mediciones", and the CSV holds only the header row. This feature adds one read route for a notebook's saved trials and wires those three pieces to it, so every value you save shows up in the panel right away and downloads as you see it. It covers scope features 7 (Trials table) and 16 (CSV export). Nothing new is stored and there is no migration.

## Requirements

**User stories**:
- As a student, I want every trial I save to appear as a row in the notebook's table right away, so that I can see my data growing while I measure.
- As a student, I want to see the last values I saved, so that I can tell at a glance that LabFlow got the latest reading.
- As a student, I want to download the table as a CSV that opens in Excel with the same rows and columns, so that I can make my report.

**Acceptance criteria**:
- **AC-1**: `GET /api/experiments/{id}/trials` returns the notebook's saved trials ordered by trial number ascending, each with its id, number, and one cell per saved measurement (`variable_id`, `value` in the variable's unit, `said_text`, and `saved_at`, which is `edited_at` when set, else `confirmed_at`). It also returns `recent`: the 5 newest measurements of the notebook by `saved_at` (then measurement id), each with its trial number and variable id. A notebook with no trials returns `{"trials": [], "recent": []}`. Behind the access session (401 without it); 404 `experiment_not_found` for an unknown id. Only `proposals.confirm` writes these rows, so the route reads `trial` and `measurement` with no status filter.
- **AC-2**: The "Ensayos" table in the panel shows one row per trial in the order the API returns, the trial number in the first column, then one column per variable in position order (the header the panel already draws). A cell shows its value through `formatQuantity(value, null)` (the unit is in the header), in the mono tabular style of the panel; a variable the trial has no value for shows "—", read as "{name} sin valor". With no trials it keeps today's empty text ("Aún no hay ensayos…"). The table scrolls sideways inside the panel when the columns do not fit; the page never scrolls sideways.
- **AC-3**: "Mediciones recientes" lists the `recent` items newest first: "Ensayo {n} · {name} {formatQuantity(value, unit)}" and the relative time of `saved_at` (the panel's `formatShortDate`). With none it keeps today's text ("Aún no hay mediciones…").
- **AC-4**: The table, the recent list, and "Ensayos guardados" in the summary refresh right after a save, with no reload: a confirm (button or "sí"), and any other save the capture stage reports through `onSaved`. They read one cached query (`experimentKeys`), invalidated by the same `onSaved` the notebook already passes to `CaptureStage`.
- **AC-5**: While the trials load, the table shows three skeleton rows and the recent list one skeleton line; a failed load shows "No pudimos cargar los ensayos" with a Reintentar button (secondary), and the rest of the panel still works.
- **AC-6**: "Exportar CSV" downloads `{slug}.csv` with the header row (`Ensayo`, then `{name} ({unit})` or `{name}`, as today) and one row per trial in table order: the trial number, then each value with a dot decimal and no thousands separator (`73.5`, `1200`), or an empty field when the trial has no value. Fields are quoted only when needed (RFC 4180, today's `csvField`), the file starts with a UTF-8 BOM so Excel keeps the accents, and the rows are exactly the ones the table shows. While the trials have not loaded, the action is `aria-disabled` with the label "Exportar CSV (cargando…)".
- **AC-7**: vitest-axe reports no violations on the panel with trials, with none, while loading, and on the load error.
- **AC-8** (2026-10-29): "Tabla completa" in Acciones rápidas opens a dialog instead of jumping to the panel's table: the title "Ensayos · {notebook title}", "{n} ensayos guardados" (or "Cargando ensayos…"), the same table with the same rows and states as the panel, wide enough for every column (it scrolls inside when the rows do not fit the screen), and an "Exportar CSV" button with the same file as AC-6. Escape or Cerrar closes it and focus returns to "Tabla completa". vitest-axe reports no violations with it open.

## Decision

**Chosen option**: one read route returning the table rows and the recent list together, cached under the notebook's query key and refreshed by the existing `onSaved` invalidation.

**Calls made in this spec** (reasoning in [rationale.md](rationale.md)):
- **One route, rows plus `recent`**: the panel needs both at once and both come from the same rows. Runner up: two routes, which costs a second request for five items.
- **The API orders, the browser does not**: trials by number, recent by time, the same rule as the notebook list (spec 0005). Runner up: sort in the browser, which would let two screens disagree.
- **Cells carry `said_text`**: unused by the table today, but it is what feature 7's provenance view (tap a number to see what you said) needs, and it costs nothing to send now.
- **CSV numbers use a dot decimal**: Excel in Spanish for Mexico reads `73.5` as a number, and a comma decimal would force quoting every value. The table on screen keeps `formatQuantity` (comma decimals), because it is read by people.
- **No pagination**: a lab notebook holds tens of trials, not thousands; the route returns them all. Revisit if a notebook passes 500 trials.

**Implementation skills**: `fastapi` · `sqlmodel` · `vercel-react-best-practices`

## Feature design

**Data model**: no new tables or columns. Reads `trial` (id, number) and `measurement` (trial_id, variable_id, value, said_text, confirmed_at, edited_at) through a new `api/app/repositories/trials.py`. One query for the rows (`trial` joined to `measurement` for the experiment, ordered by `trial.number`, `measurement.variable_id`), grouped in Python; one for `recent` (`ORDER BY coalesce(edited_at, confirmed_at) DESC, id DESC LIMIT 5`). The existing `uq_trial_experiment_number` and `ix_measurement_variable_id` / trial_id indexes cover both.

**API surface**:

| Route | Method | Body | Returns | Auth | Errors |
|---|---|---|---|---|---|
| `/api/experiments/{id}/trials` | GET | none | `TrialsView { trials: TrialRow[], recent: RecentMeasurement[] }` | session | 401, 404 `experiment_not_found` |

`TrialRow { id, number, cells: TrialCell[] }` · `TrialCell { variable_id, value, said_text, saved_at }` · `RecentMeasurement { trial_number, variable_id, value, saved_at }`. Frozen Pydantic models; `make openapi` regenerates the web types.

**Web structure**:
- `web/src/api/experiments.ts`: `getTrials(experimentId)` on the same result union as the other notebook reads, and `experimentKeys.trials(id)` = `["experiments", id, "trials"]`, under `experimentKeys.all`, so `onSaved`'s `invalidateQueries({ queryKey: experimentKeys.all })` refreshes it (AC-4).
- `web/src/hooks/use-experiments.ts`: `useTrials(experimentId)`.
- `web/src/lib/trials.ts` (pure): `tableRows(variables, trials)` (values in position order, `null` for a missing one), `recentLines(variables, recent)`, and `csvRows(rows)` with `csvNumber` (dot decimals) feeding the existing `trialsCsv`.
- `TrialsTable` (inside `notebook-inspector.tsx`) renders the table and its states; the panel and the "Tabla completa" dialog both use it, so they never disagree (AC-8).
- `NotebookView` reads `useTrials` and passes a `TrialsPanel` (`loading`, `error` with `onRetry`, or `ready`) to `NotebookInspector`, which stays presentational. Both export buttons ("Exportar datos" in the header and "Exportar CSV" in the panel) download the same rows and are `aria-disabled` until the trials load.

**Value sourcing**:

| Shown | Source |
|---|---|
| Table cells, CSV values | `measurement.value` via AC-1, in the variable's unit |
| Column headers, CSV header | `experiment.variables` (name, unit), position order |
| Recent list | `recent` from AC-1; names and units from `experiment.variables` |
| "Ensayos guardados" | `trial_count` from the notebook list (spec 0005), as today |

**Key invariants**:
- The table shows exactly what is saved: no value appears that is not a `measurement` row, and every row is shown.
- Every number on screen goes through `formatQuantity`; the CSV uses dot decimals and no units in the cells.
- The browser never sorts trials or measurements.

**Security model**: behind the access gate like every route; every code holder sees every notebook (spec 0002). Values are rendered as text.

**Critical test scenarios**:
- API: a notebook with trials 3 and 1 returns them as 1, 3 with their cells; a trial with one of three values returns one cell; `recent` holds the 5 newest across trials, an edited value counting at its `edited_at`; empty notebook; unknown id 404; no session 401, verifies **AC-1**
- Web: rows in API order with "—" for a missing value and comma decimals; recent lines; skeletons and the error with Reintentar; a save through `onSaved` refetches the trials; CSV rows with dot decimals, empty fields, and the BOM; the export is aria-disabled while loading; axe on all four states, verifies **AC-2** to **AC-7**

## Build plan

1. API: `TrialsView` models, `repositories/trials.py`, the route in `routers/experiments.py`, tests; `make openapi`, satisfies **AC-1**
2. Web: `api/trials.ts`, `use-trials.ts`, `lib/trials.ts` with unit tests, satisfies **AC-4**, **AC-6**
3. Web: `NotebookInspector` table, recent list, states, CSV wiring, tests and axe, satisfies **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-7**
4. Scope: mark features 7 and 16 in progress, link this spec.

## Consequences

**Positive**: the panel finally shows the data the capture loop saves; the CSV is usable for a report; no migration.

**Negative / tradeoffs**: the whole table loads on every save (fine at tens of trials); editing or deleting a saved trial from the table stays with feature 14.

## Follow-up

- [ ] Feature 7: tapping a value shows its provenance (`said_text`, when it was saved, and, once spec 0006's PR #12 lands, who saved it and whether it saved on its own).
- [ ] Feature 9 (chart) reads the same `useTrials` query.
- [ ] When PR #12 (save without the card) merges, its `onUndone` already invalidates `experimentKeys.all`, so an undo refreshes the table too; add a test then.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
