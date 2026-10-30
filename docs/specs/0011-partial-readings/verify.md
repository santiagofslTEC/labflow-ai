# Verify: partial readings · spec 0011 · updated 2026-10-30
_Steps derived from spec 0011 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Use a scratch notebook with Temperatura (°C, 20 a 100), Presión (bar), and Rendimiento (%), all marked Esperada.

## UI / manual
- [ ] Type "ensayo 3, temperatura 65 grados" → notice "Guardado ensayo 3 · 65 °C · Deshacer", no card, no question about Presión or Rendimiento; the table shows trial 3 with "—" in the two empty cells → AC-1, AC-2, AC-11
- [ ] Type "ensayo 3, presión 2" → notice for 2 bar; still one trial 3 row in the table, now with two values → AC-3
- [ ] Type "ensayo 3, temperatura 68" → no save; a card asks "¿Cambio Temperatura del ensayo 3 de 65 a 68 °C?" with the button "Reemplazar 65 °C por 68 °C"; press it → the table shows 68, still one row → AC-4
- [ ] Type "ensayo 3, rendimiento 74, temperatura 70" → notice "Guardado ensayo 3 · 74 %" and the card "¿Cambio … de 68 a 70 °C?" shown together → AC-5
- [ ] Press Deshacer on that notice → Rendimiento comes off trial 3 and joins the waiting card (still one card, now with 74 and 70) → AC-10
- [ ] Discard; type "ensayo 5, temperatura 650, presión 2" → presión saves now; the card for trial 5 waits with 650 flagged out of range → AC-6
- [ ] With that card waiting, type "ensayo 6, presión 3" → "Guardado ensayo 6: 3 bar. Sigue pendiente: Antes de guardar, revisa Temperatura."; the card for 5 is still there → AC-9
- [ ] Press Deshacer → "Deshecho: ensayo 6."; trial 6 is gone and card 5 stays → AC-10
- [ ] With card 5 waiting, type "ensayo 7, temperatura 900" → "Tienes el ensayo 5 sin guardar…", nothing saved → AC-9
- [ ] Discard; type "ensayo 4" → the quiet line "Ensayo 4 · esperando valores", no save button, no trial 4 in the table → AC-8
- [ ] Reload the page → the line is still there → AC-15
- [ ] Type "temperatura 66" → saved on trial 4 → AC-7, AC-8
- [ ] Type "ensayo 9" then "ensayo 10" → the line now says ensayo 10, no question → AC-8
- [ ] Open the variables dialog → the column says "Esperada", with the hint "Se espera en cada ensayo. Nunca bloquea un guardado." → AC-2
- [ ] Export CSV → empty fields for values never said; the notebook list counts only trials with a value → AC-11
- [ ] Type "ensayo 12, cincuenta" after setting up a clean value in the same sentence ("ensayo 12, presión 1, cincuenta") → presión saves, the trial stays selected, the reply asks which variable "cincuenta" is; answering "71" or "sí" saves it on trial 12 → AC-6

## Voice (the real agent, a scratch notebook; spec 0007 AC-25)
- [ ] Say "ensayo 3, temperatura 65 grados" → hear "Guardado ensayo 3: 65 °C. Di deshacer para quitarlo." → AC-1, AC-13
- [ ] Say "ensayo 3, presión 2, temperatura 68" → hear "Guardado ensayo 3: 2 bar. ¿Cambio Temperatura de 65 a 68 °C?" → AC-5, AC-13
- [ ] Say "deshacer" → presión comes off; the waiting card stays → AC-10
- [ ] Say "ensayo 4" → hear "Ensayo 4. Dime los valores." quickly (no model call) → AC-8, AC-13
- [ ] With a card waiting, say a clean sentence for another trial → hear "… Sigue pendiente: …" → AC-9, AC-13
- [ ] `uv run python scripts/voice_probe.py` on the scratch notebook with the sentences above → the spoken texts match → AC-13

## Commands
- [ ] `cd api && uv run pytest tests/test_turn_plan.py tests/test_capture_api.py tests/test_voice.py` → all pass (rerun any "database not reachable" skips) → AC-1 to AC-16
- [ ] `cd web && pnpm exec vitest run src/lib/capture.test.ts src/components/capture-stage` → all pass → AC-5, AC-8, AC-16

## Value sourcing
- [ ] Which values save now: fill a slot from a second tab between two sentences → the turn asks "¿Cambio…?" instead of replacing (test `test_a_slot_filled_in_between_asks_instead_of_replacing`) → AC-12
- [ ] "de 65 a 68": the old value comes from the trial's saved measurement; change it by hand edit on another card first and confirm the question uses the new saved value → AC-4, AC-15
- [ ] No number: with an empty selection for 8 and the latest save on 3, "temperatura 66" goes to 8; with no selection it goes to 3 → AC-7
- [ ] Bare trial: "es el ensayo 4", "prueba 4", "Ensayo 4." all select 4; "4" alone and "ensayo 4, temperatura 60" do not → AC-8
- [ ] Joined replies: the text comes from `replies.py` (`split_saved`, `saved_still_pending`) for both text and voice → AC-5, AC-9
- [ ] Undo branch: no card → reopens; same trial card → merges; other trial card → dropped → AC-10
- [ ] Superseded voice turn: "ensayo 1 temperatura 650" replaced by "ensayo 13 temperatura 65" leaves no pending card → AC-13
- [ ] Reload: a `confirm_change` card and an empty selection come back with their texts → AC-15
- [ ] Table "—" and trial count: a trial with one value shows "—" in the rest and counts once → AC-11
- [ ] "Esperada" label reads `variable.required` → AC-2

## Acceptance-criteria coverage
- AC-1, AC-2, AC-3, AC-4: UI steps 1 to 3, voice 1, dialog step · AC-5: UI 4, voice 2 · AC-6: UI 6, last UI step · AC-7: UI 12, value sourcing · AC-8: UI 10 to 13, voice 4 · AC-9: UI 7, 9, voice 5 · AC-10: UI 5, 8, voice 3 · AC-11: UI 1, export step · AC-12: value sourcing race · AC-13: voice steps · AC-14: commands (capture tests check `saved_by`, `said_text`, `auto_saved` on each half) · AC-15: UI 11, value sourcing · AC-16: web command
