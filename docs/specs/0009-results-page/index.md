# 0009. Results: chart, summary, and best trial

**Date**: 2026-10-29
**Status**: In Progress

## Summary

"Ver resultados" in the notebook header only jumps to the side panel. This feature gives it a page of its own, `/cuadernos/{id}/resultados`, with three things a student needs for a lab report: a chart of one variable against another (scope feature 9, the selector half), a summary of every variable (how many values, minimum, maximum, average), and the best trial for a variable you pick. Every number comes from saved measurements, worked out by code, and each minimum, maximum, and best names the trial it came from, so nothing on the page is invented. It adds one read route and the chart library the stack already chose (Plotly, spec 0001); no migration.

## Requirements

**User stories**:
- As a student, I want to plot one variable against another, so that I can see how, for example, the yield changes with temperature.
- As a student, I want each variable's count, minimum, maximum, and average with the trial each extreme came from, so that I can write my results without doing the math by hand.
- As a student, I want to pick a variable and whether higher or lower is better and see the best trial with all its values, so that I can tell which conditions worked.
- As a team, we want every number on this page traced to saved data, so that the "no invented numbers" promise holds here too.

**Acceptance criteria**:
- **AC-1**: "Ver resultados" in the notebook header links to `/cuadernos/{id}/resultados`. The page shows the notebook title, "Resultados", and a "Volver al cuaderno" link. An invalid or unknown id shows the notebook's "no existe" state (spec 0005, AC-11); loading shows skeletons for the chart and the summary.
- **AC-2**: The chart has an X and a Y selector listing the notebook's variables by position ("{name} ({unit})", or the name alone). By default X is the first variable and Y the second; the choice lives in the URL (`?x={variable_id}&y={variable_id}`), so a reload or a shared link keeps it, and an unknown or missing id falls back to the default. X and Y can be the same variable only if the notebook has just one variable.
- **AC-3**: The chart draws one point per trial that has a value for both variables, at exactly the saved values (the trials query of spec 0007, in the variables' units, never rounded). Hovering a point shows "Ensayo {n} · {X name} {x} · {Y name} {y}" through `formatQuantity`. The axes are titled with the variable names and units. Below the chart: "{k} ensayos graficados" and, when some trials miss X or Y, "{m} ensayos sin {name} no aparecen". With no plottable trial it shows "Aún no hay ensayos con {X} y {Y}" instead of an empty chart.
- **AC-4**: The chart is understandable without seeing it: it has a text alternative ("Gráfica de {Y} contra {X}, {k} ensayos") and a "Ver puntos" disclosure that lists the plotted points as a table (Ensayo, X, Y) in X order. Keyboard and screen reader users get the same point text from "Ver puntos" (Plotly's points cannot take focus one by one). The one series uses the `chart-1` token, which `web/design.md` reserves for Plotly; its dark step moves from `#4fbf8b` to `#3faa7b`, the nearest green that passes the dataviz validator's lightness band on the dark surface. Axes, grid, and labels use the ink, muted, and line tokens, read at runtime so the chart follows the theme.
- **AC-5**: The summary lists every variable by position: values count, minimum, maximum, and average, each value through `formatQuantity(value, unit)`. Minimum and maximum name their trials ("83 % · ensayo 10"; when several trials tie, "ensayos 3 y 7"). A variable with no values shows "Sin valores" in place of the numbers. The average is the arithmetic mean of the saved values, shown with at most 3 decimals; it names no trial.
- **AC-6**: "Mejor ensayo" has a variable selector and a choice "Más alto es mejor" or "Más bajo es mejor" (in the URL as `?best={variable_id}&dir=max|min`, defaulting to the last variable and `max`). It shows the trial with the highest or lowest value of that variable, with all its values in variable order ("—" for a missing one). On a tie it shows the lowest trial number and says "Empata con los ensayos {list}". With no values for that variable it says "Aún no hay valores de {name}".
- **AC-7**: `GET /api/experiments/{id}/results` returns, per variable in position order, `count`, `min`, `max`, `mean` (null when count is 0), and `min_trials` and `max_trials` (the trial numbers holding the extreme, ascending). The API works these out with SQL aggregates over the saved measurements (spec 0001's choice), never the browser and never the model. Behind the access session (401); 404 `experiment_not_found` for an unknown id.
- **AC-8**: The page refreshes after a save, an undo, or a variable change with no reload, through the same `experimentKeys.all` invalidation (specs 0006 to 0008). The results query is cached under that key.
- **AC-9**: The chart library loads in the browser only (`next/dynamic`, `ssr: false`), on this page only, so the notebook page does not grow. While it loads, the chart area keeps its size with a skeleton.
- **AC-10**: vitest-axe reports no violations on the page with data, with no trials, while loading, and with "Ver puntos" open.

## Decision

**Chosen option**: a page of its own reading the trials query for the chart and best trial, and one aggregate route for the summary.

**Calls made in this spec** (scope decided with the team on 2026-10-29; reasoning in [rationale.md](rationale.md)):
- **A page, not a dialog**: a chart needs width, and a link to `/resultados?x=…&y=…` can be shared or reloaded. Runner up: a dialog like "Tabla completa", with a smaller chart and no shareable state.
- **Summary on the server with SQL**: spec 0001 picked SQL aggregates for exact min, max, average, and count with their source trial; feature 10's questions will reuse this route. Runner up: compute in the browser from the trials query, which would put a second copy of the math where feature 10 cannot reuse it.
- **Chart and best trial from the trials query** (spec 0007): they only place and pick saved values; the best trial's value is the summary's own `max_trials` or `min_trials`, so the two never disagree.
- **Plotly through `react-plotly.js` with `plotly.js-basic-dist-min`**: spec 0001 chose Plotly; the basic bundle has scatter plots at about a third of the full bundle's size. Runner up: the full `plotly.js` bundle.
- **Selections in the URL**: reload and share keep them, and there is no client state to sync.
- **The spoken request ("grafica rendimiento contra temperatura")** stays with feature 10, which already answers `not_supported_yet` for it.

**Implementation skills**: `fastapi` · `sqlmodel` · `vercel-react-best-practices` · `dataviz` (before the chart code)

## Feature design

**Data model**: none new; no migration. The route reads `measurement` joined to `trial` for the notebook: one `GROUP BY variable_id` query for `count`, `min`, `max`, `avg`, and one query for the trial numbers whose value equals each variable's min or max (`ORDER BY trial.number`).

**API surface**:

| Route | Method | Returns | Auth | Errors |
|---|---|---|---|---|
| `/api/experiments/{id}/results` | GET | `ResultsView { variables: VariableSummary[] }` | session | 401, 404 `experiment_not_found` |

`VariableSummary { variable_id, count, min, max, mean, min_trials: int[], max_trials: int[] }`, frozen Pydantic models; `make openapi` regenerates the web types.

**Web structure**:
- `web/src/app/(app)/cuadernos/[id]/resultados/page.tsx`: the route, reading `params` and `searchParams` inside Suspense like the notebook page (Next.js 16 with `cacheComponents`; read `node_modules/next/dist/docs/` first).
- `web/src/components/results/`: `ResultsView` (the page body), `XYChart` (Plotly, loaded with `next/dynamic` and `ssr: false`), `VariableSummary`, `BestTrial`.
- `web/src/lib/results.ts` (pure): `chartPoints(variables, trials, x, y)` with the skipped count, `pointsInXOrder`, `extremeText(value, unit, trials)`, `bestTrial(view, trials, variable, dir)`, and the URL selection parser with its defaults.
- `useResults(id)` in `use-experiments.ts`, keyed `["experiments", id, "results"]` under `experimentKeys.all`.

**Value sourcing**:

| Shown | Source |
|---|---|
| Chart points, best trial's values, "Ver puntos" | `measurement.value` via the trials route (spec 0007) |
| Count, min, max, mean, tie trials | the results route (AC-7), SQL aggregates |
| Axis titles, selectors, units | `experiment.variables` |

**Key invariants**:
- Every number on the page is a saved value or an aggregate code computed from saved values; the model is not called.
- The best trial is always one of the summary's `max_trials` or `min_trials` for that variable.
- A trial missing X or Y is never drawn at a made up position; it is counted as not shown.

**Security model**: behind the access gate; every code holder sees every notebook (spec 0002). Values are rendered as text or as chart data, never as HTML.

**Critical test scenarios**:
- API: count, min, max, mean per variable; ties list every trial; a variable with no values gives count 0 and nulls; an edited value counts at its new value; unknown notebook 404; no session 401, verifies **AC-7**
- Web: the URL selection and its fallbacks; chart points skip trials missing X or Y and count them; the text alternative and "Ver puntos" in X order; summary rows with their trials and "Sin valores"; best trial for max and min, a tie, no values; refresh after an invalidation; the chart loads client side only (mocked in tests); axe in the four states, verifies **AC-1** to **AC-6**, **AC-8** to **AC-10**

## Build plan

1. API: `ResultsView` models, `repositories/results.py`, the route, tests; `make openapi`, satisfies **AC-7**
2. Web: `lib/results.ts` with unit tests and `useResults`, satisfies **AC-2**, **AC-3**, **AC-5**, **AC-6**, **AC-8**
3. Web: install `react-plotly.js` and `plotly.js-basic-dist-min`; the route, `ResultsView`, `XYChart`, `VariableSummary`, `BestTrial`, the header link, tests and axe, satisfies **AC-1** to **AC-6**, **AC-9**, **AC-10**
4. Scope: feature 9 in progress (selector half), linked to this spec.

## Consequences

**Positive**: the notebook finally answers "what did my experiment show"; feature 10 gets a ready aggregate route; the chart and summary always match the table.

**Negative / tradeoffs**: Plotly adds about 1 MB, loaded only on this page; one chart at a time (no multi series yet).

## Follow-up

- [ ] Feature 9: the spoken request ("grafica Y contra X") opens this page with that selection (with feature 10).
- [ ] Feature 18 (draft report) reuses the chart and the summary.
- [ ] Later: a trend line, and more than one Y series.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
