# Verify: text capture and confirm card · spec 0006 · updated 2026-10-30
_Steps derived from spec 0006 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

Setup you may want first: `make seed`, `make dev`, sign in at `/access`, then open `/dev/capture?experiment=<seeded id>` (the seeded notebook has trials 1 to 5).

## UI / manual
- [ ] Type "Ensayo 6: temperatura 65 grados, duración 20 minutos, rendimiento 74 por ciento" and press Enter → the field clears, a card for Ensayo 6 shows 65 °C, 20 min, 74 % with "65 grados", "20 minutos", "74 por ciento" on the said side, nothing highlighted, button "Guardar ensayo 6 · 3 valores" → AC-1, AC-21, AC-22
- [ ] Reload the page before saving → the same card comes back with "¿Lo guardo?" → AC-17
- [ ] Click the save button → the card turns saved and closes; the trial is in the notebook's data → AC-2
- [ ] Type "Ensayo 7, 65 grados" → card with 65 °C and empty slots, question "Me falta Duración y Rendimiento. ¿Cuánto fueron?", button "Guardar 65 °C" still enabled → AC-5
- [ ] Type "rendimiento 74" → the value joins the same card (no second card) → AC-3
- [ ] Type "No, el rendimiento es setenta y tres" → Rendimiento reads "setenta y tres" → 73 % with the 73 % highlighted → AC-4, AC-21
- [ ] Click the pencil on Rendimiento, type 72, Enter → 72 % with "Escrito a mano" → AC-4, AC-21
- [ ] Discard, then type "temperatura 50 grados" → card "Ensayo ?" asking "¿Qué número de ensayo es?", save disabled; type "ensayo 8" → the number fills in → AC-6
- [ ] With trial 3 saved, type "ensayo 3, rendimiento 75" → "El ensayo 3 ya existe…" with "Corregir ensayo 3" and "Es otro ensayo"; click Corregir → 73 % struck through next to 75 %, button "Reemplazar 73 % por 75 %" → AC-7, AC-22
- [ ] On that choice, click "Es otro ensayo" instead → the card asks for the number; type "es el ensayo 9" → number 9 → AC-7
- [ ] With card 6 pending (number and values), type "Ensayo 7, 60 grados" → card 6 unchanged, "Tienes el ensayo 6 sin guardar. ¿Lo guardo o lo descarto?"; click Guardar → card 6 saves, then trial 7's card appears without retyping → AC-8
- [ ] Repeat, but type "descártalo" instead of clicking → card 6 discarded, trial 7's card appears → AC-8, AC-13
- [ ] Type "Ensayo 10, duración 2 horas" → flagged card (amber solid edge, "Revisa antes de guardar"), "Convertí 2 horas a 120 min", save disabled; click "Sí, es 120 min" → "Revisado", save enabled → AC-9, AC-23, AC-24
- [ ] Type "Ensayo 11, temperatura 500 grados" → "Fuera del rango esperado: 20 a 100 °C"; edit it by hand to 500 → counts as checked, save enabled → AC-23
- [ ] On a flagged card, type "sí, guárdalo" → reply "Antes de guardar, revisa …", nothing saved → AC-24
- [ ] Type "temperatura 50 grados" → "¿Qué número de ensayo es?"; type "5" → the card becomes Ensayo 5 → AC-25
- [ ] Type "temperatura 23 a 71" → "Dijiste 23 y 71 para Temperatura. ¿Cuál guardo?"; type "71" → Temperatura 71 °C → AC-10, AC-25
- [ ] Type "ensayo 20 temperatura 23 a 71 grados pH 7" → a card for Ensayo 20 with pH 7 and "Dijiste 23 y 71 grados para Temperatura. ¿Cuál guardo?"; type "71" → Temperatura 71 °C on the same card (live model; repeat 3 times) → AC-34
- [ ] Type "5" with nothing pending in a notebook of 3 variables → "¿Es Temperatura, pH o Rendimiento?" → AC-33
- [ ] When LabFlow asks "¿Es Temperatura?" after "ensayo 20 …", type "71" → a card for Ensayo 20 with 71 °C, not the same question again → AC-35
- [ ] With nothing pending, type "el 5" → "¿Es Temperatura, pH o Rendimiento?" and no card; type "6: temperatura 65 grados" → a card for Ensayo 6 with 65 °C and no question about the 6 → AC-36
- [ ] On a notebook with a unitless variable, type "65 grados" → 65 with "65 grados" on the said side, no flag → AC-26
- [ ] Type "¿Cuál fue el mejor rendimiento?" → "Por ahora solo registro mediciones. Pronto podré responder preguntas y graficar." → AC-12
- [ ] Type 501 characters → the field stops at 500 → AC-16, AC-18
- [ ] While a sentence is sending, press Enter again → only one request goes out → AC-18

## Commands
- [ ] `cd api && uv run pytest` → all pass (pure planner, numbers, units, flags, repository checks, the seven routes) → AC-1 to AC-17, AC-20 to AC-26
- [ ] `cd api && uv run pytest -m live -s tests/test_live.py` → 10 sentences on each provider, each 5 s or less → AC-19
- [ ] `cd web && pnpm test` → card states, saveLabel table, CaptureStage flows, axe clean → AC-18, AC-22, AC-23
- [ ] `curl -i -X POST localhost:8000/api/proposals/1/confirm` with no cookie → 401 (same for the other six routes) → AC-16
- [ ] On a flagged, unchecked card: `POST /api/proposals/{id}/confirm` → 409 `unchecked_values` → AC-24
- [ ] With `LLM_PROVIDER=fallback` and a bad `OLLAMA_API_KEY` in `api/.env`, send a sentence → it still works through Claude, and the log line shows `fallback_reason` → AC-14, AC-19
- [ ] With both keys removed in `api/.env` (dev), send a sentence → 503 `llm_unavailable`, the card stays editable by hand → AC-14, AC-15
- [ ] `ENV=prod` without `ANTHROPIC_API_KEY` → the API refuses to start → AC-15
- [ ] In Railway logs after a few turns: each turn's JSON line has `total_ms` under 5000 → AC-19

## Value sourcing (each source, with the edge that breaks if it is wrong)
- [ ] Said text is the user's own words, not the model's: "rendimiento SETENTA Y TRES por ciento" stores "SETENTA Y TRES por ciento" exactly → AC-21
- [ ] A number the sentence lacks never reaches the card: a live turn on "rendimiento 74" never shows 75 (covered by `test_an_invented_number_never_reaches_the_card`) → AC-10
- [ ] "6" never matches inside "65" and "ensayo 6" is never a value: "ensayo 6, 65 grados" gives temperature 65 only → AC-10
- [ ] The unit comes from the words after the number, not the model: "duración 2 de horas" asks (`unknown_unit`) instead of converting → AC-21
- [ ] `previous` in a correction is the saved measurement: correct trial 3 and compare with its stored value → AC-7
- [ ] `{n}` in replies comes from the database: "Guardado el ensayo 6." matches the saved trial → AC-12
- [ ] `measurement.said_text` copies the card's said text on confirm, and is null for a hand edit → AC-21
- [ ] Changing a variable's max lower moves the flag on reload (flags are derived, not stored) → AC-23
- [ ] The Claude cap: set `CLAUDE_MAX_CALLS_PER_HOUR=0` with a stalled Ollama → the log shows `claude_cap` → AC-14

## Acceptance-criteria coverage
- AC-1 to AC-8, AC-13 · UI steps 1 to 12 and `tests/test_capture_api.py`
- AC-9 to AC-12 · UI steps 13 to 16 and `tests/test_numbers.py`, `tests/test_units.py`, `tests/test_turn_plan.py`
- AC-14, AC-15, AC-19 · Commands and `tests/test_providers.py`, `tests/test_live.py`
- AC-16, AC-17 · UI step 2, Commands, `tests/test_capture_api.py`
- AC-18, AC-22, AC-23 · UI steps and `web/src/components/{proposal-card,capture-stage}`
- AC-20 · `handle_utterance` takes `source` (feature 8 passes `voice`)
- AC-21, AC-24 · Value sourcing steps and `tests/test_proposals_checks.py`
- AC-33, AC-35, AC-36 · UI steps (error pass) and `tests/test_turn_plan.py`, `tests/test_capture_api.py`
- AC-34 · UI step "ensayo 20 temperatura 23 a 71 grados pH 7" on the live model, and `tests/test_turn_plan.py` (the prompt rule and the plan for both values)
