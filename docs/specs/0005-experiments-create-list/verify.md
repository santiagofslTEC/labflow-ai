# Verify: Notebooks create, list, and open · spec 0005 · updated 2026-10-28
_Steps derived from spec 0005 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Open `/cuadernos/nuevo`, press Usar ejemplo → title, goal, and Temperatura °C 20 a 100, Duración min 0 a 180, Rendimiento % 0 a 100 fill in; the button hides; no request is sent (network tab) → AC-6
- [ ] Clear the title and goal and remove rows back to one empty row → Usar ejemplo shows again → AC-6
- [ ] Press Crear cuaderno on the empty form → "Escribe un título" and "Escribe un nombre" under their fields, focus on Título, no request → AC-5
- [ ] Two rows "Temperatura" and " temperatura " → "Hay otra variable con este nombre" on the second → AC-5
- [ ] Mín "abc" → "Escribe un número, por ejemplo 20 o 20,5"; Mín 90, Máx 80 → "El mínimo no puede ser mayor que el máximo" → AC-4, AC-5
- [ ] Add rows until 12 → Agregar variable disabled with "Máximo 12 variables"; the remove button is disabled with one row left → AC-3
- [ ] Agregar variable moves focus to the new Nombre; removing a row moves focus to the previous Nombre (to Agregar variable for the first) → AC-18
- [ ] Usar ejemplo, then Crear cuaderno → the button shows "Creando…" and is aria-disabled; you land on `/cuadernos/{id}` with no skeleton; the notebook is first in the sidebar and in `/cuadernos` without a reload → AC-7, AC-12
- [ ] Reload `/cuadernos/{id}` → same title, goal, `Creado por {your holder name} · {today as "28 oct"} · Abierto`, 3 variables in order with "20 a 100", "Requerida" → AC-10, PA-08
- [ ] Mín "20,5" with Máx "80" → the notebook page reads "20,5 a 80" (stored as 20.5); Mín alone reads "≥ 0", no range "—", blank unit "—" → AC-4, AC-10
- [ ] Stop the API, then press Crear cuaderno → "No pudimos crear el cuaderno. Inténtalo de nuevo." and every typed value stays → AC-8
- [ ] Type in the form, then click a sidebar link or Cancelar → the confirm "¿Salir sin crear el cuaderno?" appears; reload the tab → the browser's leave prompt; an untouched form never asks → AC-9
- [ ] Delete the `labflow_session` cookie, then press Crear cuaderno → you go to `/access` with no leave prompt → AC-8, AC-9
- [ ] `/cuadernos` → hairline rows with title and `{activity} · {n} ensayos` ("sin ensayos" for a new one), newest activity first; a closed notebook shows a "Cerrado" pill → AC-1
- [ ] Confirm a measurement in an older notebook (seed or feature 6), reload `/cuadernos` → it moves above a newer untouched one; its activity reads "ahora" → AC-1, AC-14
- [ ] Change the computer time zone and reload → "Creado … 28 oct" and the activity text follow the browser's zone, the list order does not change → AC-1, AC-10
- [ ] Stop the API and open `/cuadernos` in a fresh tab → "No pudimos cargar tus cuadernos" with Reintentar, never the empty state; with the list already shown, stop the API and refocus the tab → the list stays → AC-2
- [ ] `/cuadernos/999999` and `/cuadernos/abc` → "Este cuaderno no existe" with "Ver mis cuadernos", sidebar still visible; `abc` sends no request → AC-11
- [ ] On `/cuadernos/{id}` the sidebar entry has `aria-current="page"`; with 6+ notebooks only 5 show, plus Ver todos; the phone menu shows the same section → AC-12
- [ ] `/` shows a Nuevo cuaderno button to `/cuadernos/nuevo` and a Mis cuadernos link; no screen of this feature says "experimento" → AC-13
- [ ] At 320, 390, 768, 1024, 1440, and 1920px no page scrolls sideways; below 640px each variable row stacks (Nombre and Unidad, then Mín, Máx, Requerida) → AC-18

## Commands
- [ ] `cd api && uv run pytest` → all pass (DB tests need DATABASE_URL reachable; they roll back) → AC-14 to AC-17
- [ ] `curl -s -o /dev/null -w "%{http_code}" localhost:8000/api/experiments` (no cookie) → 401, same for POST and `/api/experiments/1` → AC-17
- [ ] POST `{"title":"T","variables":[{"name":"A","min_value":NaN}]}` as a raw body → 422 `invalid_request`, nothing stored → AC-15
- [ ] POST with `"created_by": "otro"` in the body → 422 `invalid_request` (created_by only comes from the session) → AC-15
- [ ] `cd web && pnpm test` → all pass, including vitest-axe on the list, the form (empty and with errors), and the notebook page → AC-18
- [ ] `cd web && pnpm build` → passes (`/cuadernos/[id]` is a partial prerender) → all
- [ ] `make openapi && git diff --exit-code api/openapi.json web/src/api/schema.d.ts` → no diff → AC-14, AC-16

## Acceptance-criteria coverage
- AC-1 list rows, order, pill · AC-2 loading, empty, error, background refetch · AC-3 form layout, 12 limit · AC-4 units, decimals · AC-5 client validation · AC-6 Usar ejemplo · AC-7 create, cache, no double send · AC-8 failures · AC-9 leave warning · AC-10 notebook page · AC-11 not found, error · AC-12 sidebar · AC-13 home, wording · AC-14 list API · AC-15 create API · AC-16 detail API · AC-17 gate · AC-18 accessibility and phone
