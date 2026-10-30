# Verify: voice capture · spec 0007 · updated 2026-10-29
_Steps derived from spec 0007 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones. This first set covers build task 2 (the brain behind the Custom LLM); later tasks append their own._

## UI / manual (dev agent through the tunnel, `/dev/voice?experiment=<id>`)
- [ ] Start a call, say "Ensayo 7, temperatura sesenta y cinco grados, duración veinte minutos, rendimiento setenta y cuatro por ciento" → the agent speaks the reply our server wrote ("Guardé el ensayo 7." until task 3 changes the text), and trial 7 shows in the notebook → AC-3, AC-4
- [ ] Say the same reading on a notebook in the typed page → the proposal values match the voice turn → AC-3
- [ ] In the `turn` table, the voice turn's user row has `source = voice`; its assistant row has `source` null (the DB rule allows source on user turns only) → AC-3
- [ ] With `LLM_PROVIDER` pointed at a provider with no key (or the fake set to fail), speak a reading → the agent says "No pude procesarlo. Repítelo o escríbelo." and nothing is saved; say it again once the provider works → it runs and saves → AC-12, AC-14
- [ ] Keep talking through one long turn → only one save, from the newest sentence (check the API log for `"action": "supersede"`) → AC-14
- [ ] Read the API log for a call → lines carry `sid`, never the sentence, the token, or the bearer; each turn logs `llm_ms` and `total_ms` with `source: voice` → AC-15, AC-17

## Commands
- [ ] `cd api && uv run pytest tests/test_voice.py` → all pass → AC-3, AC-4, AC-12 to AC-15
- [ ] `curl -X POST $API/api/voice/llm/chat/completions -d '{}'` (no bearer) → 401 `unauthorized` → AC-13
- [ ] The same with the right bearer but no `elevenlabs_extra_body.session_token`, a forged token, or the token of a session ended with `DELETE /api/voice/session/{sid}` → 401 each, no `turn` row added → AC-13
- [ ] `DELETE /api/voice/session/{sid}` without the access cookie → 401; with it → 204, then 404 `voice_session_not_found` → AC-13
- [ ] The same request sent twice (same `messages`) → the same reply text, one save → AC-14
- [ ] A request with `"stream": false` and a `tools` list → one `chat.completion` JSON with the reply in `message.content`, no `tool_calls` → AC-4
- [ ] A turn slower than 1.5 s → the stream starts with "Mm, "; the stored assistant turn does not → AC-4
- [ ] A request whose history holds a 61st user message on one session → "Llegaste al límite de esta sesión. Empieza otra.", nothing stored → AC-14

## Value sourcing checks
- [ ] Notebook and holder come only from the token: send a token for notebook A while the browser shows notebook B → the turn lands in A → Value sourcing (notebook, holder)
- [ ] Sentence: a history whose last message is `assistant` after the last `user` → the last `user` text is used → Value sourcing (sentence)
- [ ] Turn key: two different sentences with the same count of user messages → the newer one supersedes; a new user message → a new turn → Value sourcing (turn key, replay match, superseded)
- [ ] Spoken text equals `TurnResponse.reply.text`, or the AC-12 or AC-14 fixed string → Value sourcing (spoken text)
- [ ] Filler is the constant "Mm, " only after 1.5 s → Value sourcing (filler)
- [ ] The 60 turn cap counts distinct turn keys; replays and superseded requests do not count → Value sourcing (session caps)

## Acceptance-criteria coverage
- AC-3: manual 1 to 3, value sourcing 1 and 2 · AC-4: manual 1, commands 6 and 7 · AC-12: manual 4 · AC-13: commands 2 to 4 · AC-14: manual 4 and 5, commands 5 and 8 · AC-15: manual 6 · AC-17: manual 6 (logging only; the median is task 6)
- Still open after task 2: undoing a superseded turn that already saved (task 3, AC-7); AC-1, AC-2, AC-5 to AC-11, AC-16, AC-18 to AC-20 belong to later tasks.
