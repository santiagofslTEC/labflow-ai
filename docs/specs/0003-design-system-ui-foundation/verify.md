# Verify: design system and UI foundation · spec 0003 · updated 2026-10-27

_Steps derived from spec 0003 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Run `make dev` (or `cd web && pnpm dev`) and open http://localhost:3000. You may want to repeat the manual steps once in light and once in dark (switch your system appearance).

## UI / manual

- [ ] Open `/dev/ui`, press Tab through the whole page without the mouse → every control gets the same 2px teal ring with a gap; nothing is skipped or trapped → AC-5
- [ ] On `/dev/ui`, open "Abrir diálogo" with Enter, press Tab several times → focus stays inside; press Esc → the dialog closes and focus is back on "Abrir diálogo" → AC-5
- [ ] On `/dev/ui`, open the Unidad select with Enter, pick with the arrows and Enter → the value changes and focus returns to the select → AC-5
- [ ] Measure Confirmar, Descartar, Editar (pencil), and the Dictar pill in the browser inspector → each is 48px tall; other buttons, fields, selects, and tabs are at least 40px → AC-7
- [ ] On `/dev/ui` "Tarjeta de propuesta", pick each of the 10 states → each renders: `proposed`, `editing` (field shows `73,5`), `saving` ("Guardando…"), `saved` (collapses, then "Mostrar otra vez"), `needs_clarification` (question plus an empty Duración field), `correction` (`48 °C` struck through → `50 °C`), `save_error` (alert plus Reintentar), the range warning, a missing value, and pH `7,2` with "Ensayo ?" → AC-8
- [ ] Turn your screen to grayscale (macOS: Accessibility, Display, Color filters) and compare `proposed` and `saved` → still clearly different (dashed edge plus badge vs. solid edge plus check) → AC-9
- [ ] In the card's `editing` state, type `abc` and Enter → the error "Escribe un número, por ejemplo 73,5" shows and no toast appears; type `74,2` and Enter → toast "onCommitEdit: variable 3 = 74.2" → AC-8, AC-13
- [ ] On `/dev/ui/workspace`, click the dock's text field, type `sí` and press Enter → the card is not confirmed (it still says Sin guardar) → AC-10
- [ ] With VoiceOver on (Cmd+F5), pick the card states → you hear "Propuesta del ensayo 3, sin guardar" and, in `saved`, "Ensayo 3 guardado"; `save_error` is read as an alert → AC-11
- [ ] On `/dev/ui` "Dock del micrófono", pick each of the 9 states → `idle` black "Dictar" pill; `requesting_permission`; `listening` with moving bars and a ticking timer; the pulse variant; `processing`; the three `unavailable` reasons (focus jumps to the text field); `service_error` with "No te escuché bien" and Reintentar. In every state you can still type and Enviar → AC-12
- [ ] Open `/dev/ui/workspace` at 1280px wide → two columns: conversation with the card above the dock on the left, table above chart on the right, no tab list → AC-14
- [ ] Narrow the window to 1000px, then to 320px (devtools device toolbar) → one column with Conversación · Tabla · Gráfico tabs under the header; the dock stays pinned; no sideways scroll at any width up to 1920px → AC-14
- [ ] At phone width with the card showing, open the Tabla tab → the Conversación tab shows an amber dot → AC-14
- [ ] On a phone (or the iOS simulator), tap the dock's text field → the keyboard does not cover the dock → AC-12
- [ ] On `/dev/ui` "Tarjeta a tabla", press Confirmar → after "Guardando…" the check appears, the three numbers fly into the new row 3 of the table and shrink to table size without stretching, then the card collapses → AC-15
- [ ] Press "Simular un fallo al guardar", then Confirmar → `save_error` with Reintentar focused; Reintentar → saves and flies → AC-15, AC-10
- [ ] Turn on Reduce motion (macOS: Accessibility, Display) and reload → the card and dock only fade; no rise, no flight, no spring; the mic bars do not ease → AC-15
- [ ] Look at the home page `/` → "LabFlow" serif wordmark in the sidebar (top bar below 1024px), the serif greeting "Tu cuaderno de laboratorio", and the API badge: "Conectando con la API…" then "API conectada (dev)" with the API running, or "La API no responde" with it stopped → AC-17, AC-3
- [ ] Inspect a readout (`73,5 %`) and a table number → Geist Mono with `font-variant-numeric: tabular-nums`; titles are Instrument Serif and never bold → AC-3
- [ ] Read through `web/design.md` → direction, Mobbin references, type scale, every color token with meaning, spacing, radius, shadow, motion, touch targets, layout, card anatomy and states, dock states → AC-2
- [ ] On a Vercel preview deploy, open `/dev/ui` → it renders; on production → 404 (the branded "No encontramos esta página") → AC-16

## Commands

- [ ] `cd web && pnpm test` → all pass (228 at build time), including `tokens.test.ts` (contrast in both themes), `no-raw-colors.test.ts`, and the axe checks → AC-1, AC-4, AC-6
- [ ] `cd web && pnpm lint && pnpm typecheck` → clean
- [ ] `cd web && API_URL=http://localhost:8000 VERCEL_ENV=production pnpm build && PORT=3123 pnpm start`, then `curl -s -o /dev/null -w '%{http_code}' localhost:3123/dev/ui` → `404`; `/` and `/manifest.webmanifest` → `200` → AC-16, AC-18
- [ ] `curl -s localhost:3000/manifest.webmanifest` → `name` "LabFlow AI", `short_name` "LabFlow", `lang` "es", `background_color` `#fbfaf8`, `theme_color` `#1f1b16`, three icons (`any`, `any`, `maskable`) → AC-18
- [ ] `grep -rnE "#[0-9a-fA-F]{3,8}\b|oklch\(|bg-(zinc|gray|slate)-" web/src/components web/src/app --include=*.tsx` → no matches outside tests → AC-1

## Value sourcing

- [ ] Card header: render `trialNumber={null}` (the pH example) → "Ensayo ?" with the "?" as an empty slot; `3` → "Ensayo 3" → value source `proposal.trial_number`
- [ ] Card rows: values and units come only from props; change a value in `sample-data.ts` and reload → the card and table both show the new value through `formatQuantity` → `variable.name`, `proposal_value.value/unit`
- [ ] Card correction: the struck value is the `previous` prop (48), not a constant → `measurement.value` of the target trial
- [ ] Card warning: the row text equals the `warning` prop ("Fuera del rango esperado (20 a 100 °C).") → feature 11
- [ ] Card quote: the phrase and the mic or keyboard icon follow `phrase` and `source` (the correction example is typed, so it shows the keyboard) → `original_phrase`, `source`
- [ ] Card clarification and save error: the question and the message shown equal the `state.question` and `state.message` props → assistant turn, API error `message`
- [ ] Dock listening: bars follow `level` (the demo feeds a random level; the pulse variant passes none) and the timer follows `elapsedMs` (passing 6,000,000 ms shows `99:59`) → feature 8 analyser and clock
- [ ] Dock unavailable: each `reason` maps to its fixed Spanish line → component constants
- [ ] Home: stop the API → "La API no responde"; start it with `ENV=dev` → "API conectada (dev)" → `GET /api/health` `env`
- [ ] `/dev/ui` visibility: `VERCEL_ENV` unset or `preview` → shown; `production` → 404 → `isDevUiEnabled(process.env.VERCEL_ENV)`
- [ ] Flight ids: the card values and the new row's cells share `trial-3-1`, `trial-3-2`, `trial-3-3` (inspect with React DevTools) → `layoutIdPrefix` + `variableId`
- [ ] `onSettled`: in the card states demo, `saved` turns into "La tarjeta guardada se cerró…" exactly once → the exit timer
- [ ] Edit field initial text: `73,5` with a comma and no unit → `formatQuantity(value, null)`
- [ ] Theme: switch the system appearance → the whole app flips with no reload or toggle → `prefers-color-scheme`
- [ ] Locale: every number uses a decimal comma (`73,5`, `7,2`), never a dot → the `"es"` constant in `format.ts`
- [ ] Manifest colors: equal the light `--color-canvas` and `--color-ink` (`manifest.test.ts` checks it) → constants in `manifest.ts`

## Acceptance-criteria coverage

- AC-1: Commands (tests, grep) · AC-2: design.md read-through · AC-3: home and readout inspection · AC-4: `tokens.test.ts` · AC-5: Tab, Dialog, Select steps · AC-6: axe in `pnpm test` · AC-7: inspector measurements · AC-8: card states, edit step · AC-9: grayscale step · AC-10: dock `sí` step, save_error focus · AC-11: VoiceOver step · AC-12: dock states, phone keyboard · AC-13: edit step, locale step · AC-14: workspace width steps, tab dot · AC-15: flight, fallo, reduced motion · AC-16: preview/production steps, gate command · AC-17: home step · AC-18: manifest commands
