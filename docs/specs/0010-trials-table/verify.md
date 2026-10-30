# Verify: trials table, recent measurements, and CSV export · spec 0010 (was 0007) · updated 2026-10-29
_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Open a notebook with no trials → "Aún no hay ensayos" and "Aún no hay mediciones" as before → AC-2, AC-3
- [ ] Save "Ensayo 6: temperatura 65 grados, duración 20 minutos, rendimiento 74 por ciento" → without a reload the table shows row 6 with 65, 20, 74; "Mediciones recientes" lists them; "Ensayos guardados" goes up by one → AC-2, AC-3, AC-4
- [ ] Save "Ensayo 7, temperatura 70,5" and save it partial → row 7 shows 70,5 and "—" in the other two columns → AC-2
- [ ] Press Tabla completa → a dialog "Ensayos · {title}" with every trial and column; Escape closes it and focus is back on Tabla completa → AC-8
- [ ] Press Exportar CSV and open the file in Excel → the same rows and columns, 70.5 read as a number, accents intact → AC-6
- [ ] With the API stopped, reload → "No pudimos cargar los ensayos" with Reintentar; start the API and press it → the table loads → AC-5

## Commands
- [ ] `cd api && uv run pytest` → the trials route tests pass → AC-1
- [ ] `cd web && pnpm test` → panel states, refresh after a save, CSV rows, axe → AC-2 to AC-8
