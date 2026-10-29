# Verify: Notebooks create, list, and open · spec 0005 · updated 2026-10-28
_Steps derived from spec 0005 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Open `/cuadernos/nuevo`, press Usar ejemplo → title, goal, and Temperatura °C 20 a 100, Duración min 0 a 180, Rendimiento % 0 a 100 fill in; the button hides; no request is sent (network tab) → AC-6
- [x] Clear the title and goal and remove rows back to one empty row → Usar ejemplo shows again → AC-6
- [x] Press Crear cuaderno on the empty form → "Escribe un título" and "Escribe un nombre" under their fields, focus on Título, no request → AC-5
- [x] Two rows "Temperatura" and " temperatura " → "Hay otra variable con este nombre" on the second → AC-5
- [x] Mín "abc" → "Escribe un número, por ejemplo 20 o 20,5"; Mín 90, Máx 80 → "El mínimo no puede ser mayor que el máximo" → AC-4, AC-5
- [x] Add rows until 12 → Agregar variable disabled with "Máximo 12 variables"; the remove button is disabled with one row left → AC-3
- [x] Agregar variable moves focus to the new Nombre; removing a row moves focus to the previous Nombre (to Agregar variable for the first) → AC-18
- [x] Usar ejemplo, then Crear cuaderno → the button shows "Creando…" and is aria-disabled; you land on `/cuadernos/{id}` with no skeleton; the notebook is first in the sidebar and in `/cuadernos` without a reload → AC-7, AC-12
- [x] Reload `/cuadernos/{id}` → same title, goal, `Creado por {your holder name} · {today as "28 oct"} · Abierto`, 3 variables in order with "20 a 100", "Requerida" → AC-10, PA-08
- [x] Mín "20,5" with Máx "80" → the notebook page reads "20,5 a 80" (stored as 20.5); Mín alone reads "≥ 0", no range "—", blank unit "—" → AC-4, AC-10
- [x] Stop the API, then press Crear cuaderno → "No pudimos crear el cuaderno. Inténtalo de nuevo." and every typed value stays → AC-8
- [x] Type in the form, then click a sidebar link or Cancelar → the confirm "¿Salir sin crear el cuaderno?" appears; reload the tab → the browser's leave prompt; an untouched form never asks → AC-9
- [x] Delete the `labflow_session` cookie, then press Crear cuaderno → you go to `/access` with no leave prompt → AC-8, AC-9
- [x] `/cuadernos` → hairline rows with title and `{activity} · {n} ensayos` ("sin ensayos" for a new one), newest activity first; a closed notebook shows a "Cerrado" pill → AC-1
- [x] Confirm a measurement in an older notebook (seed or feature 6), reload `/cuadernos` → it moves above a newer untouched one; its activity reads "ahora" → AC-1, AC-14
- [x] Change the computer time zone and reload → "Creado … 28 oct" and the activity text follow the browser's zone, the list order does not change → AC-1, AC-10
- [x] Stop the API and open `/cuadernos` in a fresh tab → "No pudimos cargar tus cuadernos" with Reintentar, never the empty state; with the list already shown, stop the API and refocus the tab → the list stays → AC-2
- [x] `/cuadernos/999999` and `/cuadernos/abc` → "Este cuaderno no existe" with "Ver mis cuadernos", sidebar still visible; `abc` sends no request → AC-11
- [x] On `/cuadernos/{id}` the sidebar entry has `aria-current="page"`; with 6+ notebooks only 5 show, plus Ver todos; the phone menu shows the same section → AC-12
- [x] `/` shows a Nuevo cuaderno button to `/cuadernos/nuevo` and a Mis cuadernos link; no screen of this feature says "experimento" → AC-13
- [x] At 320, 390, 768, 1024, 1440, and 1920px no page scrolls sideways; below 640px each variable row stacks (Nombre and Unidad, then Mín, Máx, Requerida) → AC-18

## Commands
- [x] `cd api && uv run pytest` → all pass (DB tests need DATABASE_URL reachable; they roll back) → AC-14 to AC-17
- [x] `curl -s -o /dev/null -w "%{http_code}" localhost:8000/api/experiments` (no cookie) → 401, same for POST and `/api/experiments/1` → AC-17
- [x] POST `{"title":"T","variables":[{"name":"A","min_value":NaN}]}` as a raw body → 422 `invalid_request`, nothing stored → AC-15
- [x] POST with `"created_by": "otro"` in the body → 422 `invalid_request` (created_by only comes from the session) → AC-15
- [x] `cd web && pnpm test` → all pass, including vitest-axe on the list, the form (empty and with errors), and the notebook page → AC-18
- [x] `cd web && pnpm build` → passes (`/cuadernos/[id]` is a partial prerender) → all
- [x] `make openapi && git diff --exit-code api/openapi.json web/src/api/schema.d.ts` → no diff → AC-14, AC-16

## Acceptance-criteria coverage
- AC-1 list rows, order, pill · AC-2 loading, empty, error, background refetch · AC-3 form layout, 12 limit · AC-4 units, decimals · AC-5 client validation · AC-6 Usar ejemplo · AC-7 create, cache, no double send · AC-8 failures · AC-9 leave warning · AC-10 notebook page · AC-11 not found, error · AC-12 sidebar · AC-13 home, wording · AC-14 list API · AC-15 create API · AC-16 detail API · AC-17 gate · AC-18 accessibility and phone

## Notebook from instructions (added 2026-10-29, AC-19 to AC-35)

### UI / manual
- [ ] Open `/cuadernos/nuevo` → the "Desde instrucciones" panel with Subir PDF and Pegar texto; Llenar a mano shows the empty form and a "Leer instrucciones" link → AC-19
- [ ] Paste 20 characters → "Pega un poco más de las instrucciones." and no request (network tab); choose a PNG → "Elige un archivo PDF."; choose an 11 MB PDF → "El PDF pesa más de 10 MB." → AC-20
- [ ] Paste a real handout, press Leer → "Leyendo instrucciones…", aria-disabled, "Puede tardar hasta un minuto."; Cancelar lectura returns to the panel with the text kept → AC-21
- [ ] Let it finish → banner, chip "Texto pegado · {n} caracteres", Título, Objetivo, Contexto, and rows filled; a stated range shows «quote» under its row; a variable with no stated range has blank Mín and Máx → AC-23, AC-24
- [ ] Change that row's Mín → the quote line disappears and stays gone → AC-24
- [ ] Press Leer instrucciones again with the form changed → "¿Reemplazar lo que escribiste con lo que leímos?"; Cancelar keeps the form → AC-27
- [ ] Press Crear → the notebook page shows the Contexto block and "Instrucciones: texto pegado"; reload, intact → AC-29, AC-31
- [ ] Upload a 70 page manual → "Este PDF tiene 70 páginas…", enter 12 a 18 → rows with « » · p. 12 to 18; enter 1 a 70 → "Esas páginas tienen demasiado texto. Elige menos páginas." → AC-22
- [ ] Upload a scanned PDF → "Este PDF no tiene texto. Pega las instrucciones."; an 81 page PDF → "El PDF tiene 81 páginas; el máximo es 80." → AC-30
- [ ] Set `LLM_PROVIDER` so both providers fail (or stop the network to them) → "No pudimos leer las instrucciones…"; the form opens blank with the chip; fill it and Crear → the notebook page shows "Instrucciones: {file} ({n} págs)" → AC-28, AC-29
- [ ] With instructions attached, Usar ejemplo is hidden and clicking a sidebar link asks before leaving; Quitar removes the chip and keeps every value → AC-23, AC-27
- [ ] Make a manual notebook with a Contexto, then dictate in it → the capture log or the prompt test shows "Contexto del experimento" → AC-26
- [ ] Keyboard only through the panel: radio group, file input, Leer, Cancelar lectura, Quitar; the reading status is announced; after a read focus lands on Título; at 320px nothing scrolls sideways → AC-35
- [ ] On the Vercel preview, upload a 9.5 MB PDF → the read reaches Railway (no 413 from Vercel) → AC-29, AC-30

### API / automated
- [ ] pytest: the read route with the fake provider returns a proposal and writes no row in any table → AC-32, AC-33
- [ ] pytest: `ground_proposal` drops an unquoted range, a range whose numbers are not in the quote, and min > max; computes the page; removes a context sentence with an unfound number; dedupes names; cuts to 12 with `found_count` 15 → AC-25
- [ ] pytest: a multipart create with a duplicate name returns 422 `duplicate_variable_name` and leaves no `experiment`, `protocol`, or `protocol_page` row → AC-29
- [ ] pytest: 413 at 10 485 761 bytes, `pdf_unreadable`, `too_many_pages`, `no_text_in_pdf`, `invalid_page_range`, `instructions_missing` on both routes → AC-30
- [ ] pytest: `GET /api/experiments/{id}` returns `context` and the protocol summary, never `file_bytes` → AC-31
- [ ] pytest: both new routes return 401 without a cookie → AC-34
