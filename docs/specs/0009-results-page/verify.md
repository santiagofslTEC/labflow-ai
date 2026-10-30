# Verify: results page · spec 0009 · updated 2026-10-29
_Steps derived from spec 0009 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] On a notebook with trials, press Ver resultados → `/cuadernos/{id}/resultados` with the chart, the summary, and Mejor ensayo; Volver al cuaderno returns → AC-1
- [ ] Pick X Temperatura and Y Rendimiento → one point per trial at the table's values; hover a point → "Ensayo 6 · Temperatura 65 · Rendimiento 74"; reload keeps the choice → AC-2, AC-3
- [ ] Save a trial with only Temperatura → "1 ensayo sin Rendimiento no aparece" under the chart → AC-3
- [ ] Open Ver puntos → a table of the plotted points in Temperatura order → AC-4
- [ ] The summary shows each variable's count, min, max, and average; the max names its trial → AC-5
- [ ] Mejor ensayo: Rendimiento, Más alto es mejor → the trial with the highest yield and all its values; switch to Más bajo → the lowest → AC-6
- [ ] Save a new trial in another tab, come back → the chart and summary include it without a reload → AC-8

## Commands
- [ ] `cd api && uv run pytest` → the results route tests pass → AC-7
- [ ] `cd web && pnpm test` → selection, points, summary, best trial, refresh, axe → AC-1 to AC-10
