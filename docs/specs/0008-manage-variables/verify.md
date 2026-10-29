# Verify: review, add, edit, and delete variables · spec 0008 · updated 2026-10-29
_Steps derived from spec 0008 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Press Revisar variables → a dialog "Variables · {title}" with every variable, its unit, range, type, and "{n} valores"; Escape closes it and focus is back on Revisar variables → AC-1
- [ ] Agregar variable, "Presión", unit "kPa", Mín 1, Máx 5, Guardar → it appears last in the dialog, the panel, and as a new column with "—" in the trials table → AC-2, AC-7
- [ ] Editar Temperatura (with saved values) → Unidad is disabled with the reason; change Máx to 120 and Guardar → the range updates everywhere → AC-3, AC-7
- [ ] Editar Presión (no values) → change the unit to "atm" and Guardar → it saves → AC-3
- [ ] Rename Presión to "temperatura" → "Hay otra variable con este nombre" under Nombre; Mín 9, Máx 2 → "El mínimo no puede ser mayor que el máximo" → AC-4
- [ ] Check Presión and Duración → "Eliminar 2 variables"; Seleccionar todas → Eliminar disabled with "Deja al menos una variable" → AC-5
- [ ] With Presión and Duración checked, Eliminar → "Se borrarán Presión y Duración y {k} valores guardados. Esto no se puede deshacer."; confirm → "Eliminé 2 variables y {k} valores."; the columns are gone from the table and the CSV → AC-6, AC-7

## Commands
- [ ] `cd api && uv run pytest` → the variables routes tests pass → AC-2 to AC-8
- [ ] `cd web && pnpm test` → dialog states, forms, selection, confirmation, axe → AC-1 to AC-9
