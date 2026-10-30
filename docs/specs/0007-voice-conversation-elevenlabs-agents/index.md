# 0007. Voice conversation with an ElevenLabs Agent and our server as its brain

**Date**: 2026-10-29
**Status**: In Progress

## Summary

You talk to LabFlow and it talks back. An ElevenLabs Agent does the listening, the turn taking, and the speaking, while our own FastAPI server stays the brain: ElevenLabs sends every sentence you say to a new endpoint of ours (a "Custom LLM", meaning our server plays the part of the agent's language model), which runs the same capture turn as typing and streams back our checked Spanish reply, spoken word for word. A clean reading (every number checked by code) saves at once and reads the values back, and you can say "deshacer" for five minutes; anything unsure shows the card and asks out loud. It starts on the main page (`/`), with a switch between hands free and hold to talk.

## Requirements

**User stories**:
- As a student with gloves on, I want to say a trial out loud and hear what LabFlow saved, so that I never put down what I am holding.
- As a student, I want LabFlow to ask me out loud only when something is unsure, so that I am not confirming every reading.
- As a student who misspoke, I want to say "deshacer" right after a save, so that a wrong reading never stays in my table.
- As a student in a noisy lab, I want to switch to hold to talk, so that lab noise does not start a turn.

**Acceptance criteria**:
- **AC-1**: On `/` with an active notebook (spec 0004), tapping the mic in hands free mode calls `POST /api/voice/session`, starts the ElevenLabs session with the returned signed URL and session token, and the agent's first message is "Te escucho. Dicta el ensayo." The mic shows the listening state with the input level; a stop button ends the session and calls `DELETE /api/voice/session/{sid}`.
- **AC-2**: The center shows the user text the hook reports through `onMessage` while you speak (tentative text when the SDK sends it, otherwise "Escuchando…"), in the display serif with `aria-live="off"`; the final user text of each turn is announced once in the polite region. Checked with a mocked hook.
- **AC-3**: Each user turn reaches `POST /api/voice/llm/chat/completions` (OpenAI compatible, streamed; the agent is configured with the base `/api/voice/llm` because ElevenLabs appends `/chat/completions` itself). The sentence is the text of the last message with role `user`, stripped (assistant and system messages, including the first message, are skipped). It runs `handle_utterance(..., source="voice", auto_save=True)` (spec 0006 AC-20). The same sentence gives the same proposal values as typing it. A user turn and an assistant turn are stored with `source = voice`.
- **AC-4**: The spoken text is exactly the reply our server wrote (`services/replies.py`), streamed as chat completion chunks ending in `data: [DONE]`. When the reply is not ready after 1.5 s, the stream first sends "Mm, "; the stored assistant turn holds the reply only, never the filler. The endpoint ignores `tools` and `tool_choice` in the request, never returns a tool call, and answers a `stream: false` request with one complete chat completion holding the same text. The only words spoken that our server did not write are the agent's first message (AC-1).
- **AC-5**: Auto save: after every voice turn (including one that fills a pending card), the planner adds a `Confirm` step inside the same turn when the pure `is_clean(view)` holds: the card has a trial number not already saved, no correction target, every required value present, `can_confirm` true, no flagged value (no `out_of_range`, `converted`, or `code_match`, spec 0006 AC-23), and its question is `ready`. The confirm runs only if the card's `(id, updated_at)` still matches the plan when the confirm takes its row lock; otherwise nothing is saved and the card's question is spoken. The reply reason `auto_saved` reads "Guardado ensayo {n}: {values}. Di deshacer para quitarlo." with values like "65 °C, 20 min y 74 %" (decimal comma, `format_number` plus unit, joined by `join_names`). No card shows; the saved notice and "Último" update (AC-20).
- **AC-6**: A reading that is not clean keeps spec 0006 behavior: the card shows on screen and its question is spoken ("¿Lo guardo?", the missing values, `choose_trial`, `check_values`, and so on). "sí" or "guárdalo" saves when `can_confirm` is true; a flagged value still needs its check button or a hand edit on screen. A new trial said while another card is pending (`pending_other_trial`) speaks "Tienes el ensayo {n} sin guardar. ¿Lo guardo o lo descarto?" and the new sentence is not kept (voice has no waiting sentence); you say it again after answering.
- **AC-7**: Undo: before the model is called, code matches the sentence (folded, whole words) against "deshacer", "deshazlo", "quita el último", "borra el último". With a pending card, a match means discard the card (spec 0006 `descartar`). With no pending card, it undoes the last save when it is undoable: the most recent proposal of the notebook whose status is `confirmed` or `undone` is `confirmed` (so an undo never reaches an older save), it had no correction target, and 300 s or less passed since its confirm. Undo locks the proposal (`SELECT ... FOR UPDATE`), deletes its trial (measurements cascade), sets the proposal to `undone`, stores the turns, and replies "Deshecho: ensayo {n}." (reason `undone`). Otherwise the reply is "No hay nada que deshacer." (reason `nothing_to_undo`). This applies to saves made by voice, by Guardar, or by "sí". `POST /api/experiments/{id}/undo` does the same and returns 409 `nothing_to_undo` when there is nothing; a second undo, by any path, gets that answer. A confirm sent for an `undone` proposal returns `not_pending`.
- **AC-8**: A "Manos libres · Mantener" switch under the mic (a labelled radio group) picks the mode, stored in this browser under `labflow.voiceMode` (default `hands_free`). In `hold` mode the session's mic is muted except while the mic is held (pointer, or Space with focus on the mic, spec 0004 AC-6 press rules). How a release ends the turn is settled by build task 1 (fact d); until then, hold mode is shown as "Mantener (beta)".
- **AC-9**: `agent.json` enables interruptions, so speaking over the agent stops it (checked as a config value; the barge in itself happens inside ElevenLabs).
- **AC-10**: A session ends on the stop button, after 60 s with no user text in hands free mode (a browser timer reset by every user message; hold mode has no silence timer), at 10 min (`max_duration_seconds = 600` in `agent.json`), when the tab hides (including a phone lock) or the page is left, or when the active notebook changes. A pending card stays as it was.
- **AC-11**: If the session cannot start or drops (503 `voice_unavailable`, an ElevenLabs error, no minutes left, mic denied, no device, insecure page), the mic shows "No te escuché bien" with the reason, the text field opens with focus, and typed capture keeps working (RNF-09, spec 0004 AC-16).
- **AC-12**: When our brain fails for a turn (spec 0006 `LLMUnavailable`), the agent speaks "No pude procesarlo. Repítelo o escríbelo." The card stays as it was, nothing is saved, and the failure is not cached (AC-14), so saying it again runs a new turn.
- **AC-13**: `POST /api/voice/llm/chat/completions` is in `OPEN_PATHS` (exact path) and outside the cookie gate. A missing or wrong `Authorization: Bearer` secret (compared with `hmac.compare_digest`) returns 401; a missing, expired, forged, or ended session token returns 401; both checks run before any database or model work. `POST /api/voice/session`, `DELETE /api/voice/session/{sid}`, `GET .../last-save`, and `POST .../undo` sit behind the access gate (401 without a session). ElevenLabs calls Railway directly, never through the Vercel rewrite.
- **AC-14**: Replays, partial turns, and limits per session. A turn is keyed by `(sid, count of user messages)`. ElevenLabs may send the same turn again with a longer sentence while you keep talking (seen in task 1), and only the newest reply is spoken, so the newest request wins:
  - Same key, same sentence (hash matches): a finished turn streams its stored reply again; a running turn is waited for and its reply streamed.
  - Same key, different sentence: the older turn is superseded. If it has not written yet, it writes nothing and its stream ends with no text. If it already auto saved (AC-5), the newer request first undoes that save with the AC-7 undo (status `undone`, reason not spoken), then runs its own sentence. The older turn's stored user and assistant turns stay as a record.
  - Failed turns are not stored. A session accepts at most 60 turns (superseded requests do not count); the 61st speaks "Llegaste al límite de esta sesión. Empieza otra." and runs nothing.
- **AC-15**: `agent.json` sets ElevenLabs audio and transcript retention off: `platform_settings.privacy` with `record_voice` false, `retention_days` 0, `delete_audio` true, `delete_transcript_and_pii` true. `zero_retention_mode` stays false, because ElevenLabs refuses it on an agent with a Custom LLM (`custom_llm_not_allowed_in_zrm`, task 1). LabFlow stores text turns only, never audio. Log lines carry `sid`, never the transcript, the token, or the bearer.
- **AC-16**: The agent is defined by `api/voice/agent.json` and created or updated by `uv run python scripts/sync_agent.py --env dev|prod` (running it twice changes nothing). Dev and prod are two agents, each pointing at its own Custom LLM URL. `agent.json` disables every ElevenLabs system tool.
- **AC-17**: Latency is measured, not bounded: each voice turn logs `llm_ms` and `total_ms`, and the demo run in build task 6 records the median from the end of speech to the start of the spoken reply; the target is 5 s or less (RNF-02).
- **AC-18**: Accessibility and phone: the mode switch, start, stop, and Deshacer work by keyboard with visible focus; session states are announced in one polite live region; vitest-axe reports no violations in idle, listening, agent speaking, saved notice, and error; a manual check at 320 px shows no sideways scroll.
- **AC-19**: The notebook page dock (`/cuadernos/[id]`, spec 0004 AC-19) starts the same voice session for that notebook, with the same switch, notice, and undo (the same `useVoiceSession` hook and components).
- **AC-20**: The browser learns that a turn finished by refetching, never by guessing: on every `onMessage` from the agent and every mode change back to listening, it invalidates the card (`GET /api/experiments/{id}/proposal`), the saved notice (`GET /api/experiments/{id}/last-save`), and spec 0004's summary query ("Último"). `last-save` returns `{ proposal_id, trial_number, text, seconds_left, version }` or null (null once undone or after 300 s); the browser counts `seconds_left` down from when it received it, ignores a response with an older `version`, and a Deshacer pressed after expiry shows "Ya no se puede deshacer."

## Decision

**Chosen option**: Option 1: ElevenLabs Agent for voice, our FastAPI as its Custom LLM

ElevenLabs handles listening, turn taking, and speech; every user turn is sent to our OpenAI compatible streaming endpoint, which runs spec 0006's capture turn and returns our reply word for word. Built Agent first (the engineer's call, over the cross check's suggestion of a Scribe plus text to speech slice first; see rationale.md).

**Implementation skills**: `agents` (`elevenlabs/skills`, `.claude/skills/agents/`) · `speech-to-text` (`elevenlabs/skills`, `.claude/skills/speech-to-text/`) · `fastapi` (`fastapi/fastapi`, `.claude/skills/fastapi/`) · `sqlmodel` (`fastapi/sqlmodel`, `.claude/skills/sqlmodel/`) · `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) · `use-railway` (`railwayapp/railway-skills`, `.claude/skills/use-railway/`)

**Precedence**: for voice behavior this spec replaces spec 0004's Slice B criteria AC-6 (default mode), AC-7 (source of live words), AC-8 and AC-9 (session caps instead of per dictation caps), and AC-10's "Transcribiendo…" step; spec 0004 Slice A (the typed `/` page) is a prerequisite. It replaces spec 0001's "Speech to text: ElevenLabs Scribe called from FastAPI" row; spec 0001's "no LangGraph" row stands for capture. It changes spec 0006's invariant "nothing is saved except by Guardar or sí" for voice turns (AC-5).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (one small migration, additive):

| Table | Change | Rule |
|---|---|---|
| `proposal` | `status` gains `undone` (`ProposalStatus.UNDONE`); the migration drops and recreates `ck_proposal_status` by name with the new list | `undone` is terminal and keeps `resolved_at` (so `(status = 'pending') = (resolved_at IS NULL)` still holds); `confirmed_trial_id` becomes null by the existing `ON DELETE SET NULL` when undo deletes the trial; the partial unique index on pending proposals is unaffected |
| `trial`, `measurement` | no column change; undo deletes the trial and its measurements cascade | only the undoable save (AC-7) |
| `turn` | no change; voice turns use `source = voice` | the "deshacer" turns are stored like any turn |

No new table or column. Readers of `proposal.status` to review: `repositories/capture.card_info`, `proposals.get_pending`, `services/proposal_rules.plan_confirm` (an `undone` proposal is `NotPending`, never a repeat confirm), `routers/capture._pending`, and any switch on the status in `web/src/api/schema.d.ts` consumers after `make openapi`.

New reply reasons in `services/replies.Reason`: `auto_saved`, `undone`, `nothing_to_undo`, `session_limit`.

**State transitions**:
- Proposal: `pending → confirmed → undone` (new), alongside spec 0002's `pending → discarded | superseded`.
- Voice session (browser): `idle → starting → listening ⇄ agent_speaking → idle` (stop, silence 60 s in hands free, 10 min, tab hidden, notebook change) and `starting | listening → error` (AC-11). In `hold` mode, `listening` is muted unless the mic is held.
- Voice session (server): the `sid` is active from `POST /api/voice/session` until `DELETE`, 25 min, or 60 turns; an ended `sid` makes its token invalid.
- Undo window (derived, never stored): open from the confirm until 300 s pass, the save is undone, or a later proposal of the notebook is confirmed.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/voice/session` | POST | `experiment_id`: int (req) | `{ sid, signed_url, session_token, expires_at }` (`expires_at` = now + 15 min, the signed URL's documented life) | access session | 404 `experiment_not_found`, 503 `voice_unavailable` (no key, no agent id, ElevenLabs error), 401 |
| `/api/voice/session/{sid}` | DELETE | path `sid` | 204 | access session (same holder) | 404 when unknown, 401 |
| `/api/voice/llm/chat/completions` | POST, SSE | OpenAI chat body as ElevenLabs sends it (task 1): `messages` (req, the whole history with roles `system`, `assistant`, `user`), `stream` (true), `stream_options`, `model`, `max_tokens`, `temperature`; the session token in `elevenlabs_extra_body.session_token` | `text/event-stream` chat completion chunks with our reply, then `[DONE]`; or one JSON completion when `stream` is false | `Authorization: Bearer {VOICE_LLM_SECRET}` + an active session token | 401 `unauthorized`; brain failure and session limit are spoken replies, not HTTP errors |
| `/api/experiments/{id}/last-save` | GET | path `id` | `{ proposal_id, trial_number, text, seconds_left, version } \| null` | access session | 404, 401 |
| `/api/experiments/{id}/undo` | POST | path `id` | `{ trial_number, reply }` | access session | 409 `nothing_to_undo`, 404, 401 |

Where things live (AGENTS.md layering): `api/app/voice/session.py` (sign and read the token with `itsdangerous`, like the access cookie), `voice/agent_config.py` (pure: the ElevenLabs agent payload from `agent.json` plus env), `voice/elevenlabs.py` (I/O: signed URL, agent create and update), `voice/sse.py` (pure: chunk encoding), `voice/sessions.py` (the active `sid` set, turn counts, and the replay cache with in flight futures, on `app.state`, built in the lifespan, entries dropped after 30 min; per process and lost on redeploy, accepted). `api/app/routers/voice.py` holds the three voice routes. Auto save: `services/turn_plan.py` gains a pure `is_clean(view)` and appends `Confirm` when `auto_save` is set; the confirm in `services/turns._apply` checks `(id, updated_at)` under the lock. Undo: a pure `services/undo_rules.py` (`match_undo(text)`, `can_undo(last, now)`), `repositories/proposals.undo_last` and `last_save`, called from `handle_utterance` before the model and from `routers/capture.py`. Web: `web/src/hooks/use-voice-session.ts` wraps `useConversation` from `@elevenlabs/react`; `web/src/components/push-to-talk/` gains the mode switch, live words, and the saved notice; `web/src/api/voice.ts` holds the fetchers.

**Agent config** (`api/voice/agent.json`, confirmed in task 1 with `sync_agent.py --show`): language `es`; voice `EXAVITQu4vr4xnSDxMaL` with `eleven_flash_v2_5` (kept from task 1; a Latin American neutral voice can replace it before the demo); first message "Te escucho. Dicta el ensayo."; Custom LLM `url` = `VOICE_LLM_URL` + `/api/voice/llm` (ElevenLabs appends `/chat/completions`), `model_id` `labflow-capture`, `api_type` `chat_completions`, key `VOICE_LLM_SECRET` stored as an ElevenLabs secret; every system tool off (`built_in_tools` all null); interruptions on; `max_duration_seconds` 600; `turn.turn_eagerness` patient, `turn.turn_timeout` 10, `silence_end_call_timeout` -1; `platform_settings.auth.enable_auth` true (private agent); `platform_settings.overrides.custom_llm_extra_body` true; privacy as in AC-15.

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Start session | notebook | `experiment_id` in the body; the page's active notebook (spec 0004 AC-2) |
| Start session | holder | the access session (`HolderDep`), sealed into the token |
| Start session | `signed_url` | ElevenLabs `GET /v1/convai/conversation/get-signed-url?agent_id=…` with `ELEVENLABS_API_KEY` |
| Start session | `expires_at` | now + 15 min (the signed URL's documented life) |
| Start session | `sid`, `session_token` | `sid` random; token = `itsdangerous` signature over `{ sid, holder, experiment_id, iat }` with `SESSION_SECRET`, max age 25 min; a reconnect mints a new one |
| Custom LLM turn | sentence | the last `role: user` message's text, stripped |
| Custom LLM turn | notebook, holder | the session token only |
| Custom LLM turn | turn key, replay match | key: `sid` plus the count of `user` messages; replay match: a SHA 256 of the sentence under that key |
| Custom LLM turn | superseded or not | a newer request under the same key with a different hash (AC-14); the save to undo is the one the superseded turn recorded in `voice/sessions.py` |
| Custom LLM turn | spoken text | `TurnResponse.reply.text`; the AC-12 or AC-14 fixed strings |
| Custom LLM turn | filler | constant "Mm, " after 1.5 s without a reply |
| Auto save | clean or not | `is_clean(view)` on the planned `ProposalView` (AC-5 rule) |
| Auto save | "Guardado ensayo {n}: {values}" | the card's values with `format_number` plus unit, `join_names` |
| Undo | which save, allowed | the latest notebook proposal with status in (`confirmed`, `undone`) by `resolved_at` desc; `can_undo` (status `confirmed`, `target_trial_id` null, 300 s) |
| Undo | trigger | `match_undo(text)` on the folded sentence, before the model; a pending card turns it into a discard |
| Saved notice | text, `seconds_left`, `version` | `last_save`: the reply text rebuilt from the saved measurements, `300 - (now - resolved_at)`, the proposal id plus `resolved_at` as a sortable version |
| "Último" | last saved trial | spec 0004's summary query, invalidated per AC-20 |
| Card after a voice turn | card | `GET /api/experiments/{id}/proposal` (spec 0006 AC-17), invalidated per AC-20 |
| Live words | user text | `useConversation` `onMessage` events (browser only) |
| Mode | hands free or hold | `localStorage["labflow.voiceMode"]`, default `hands_free` |
| Session caps | 60 s silence, 10 min, 60 turns | browser timer (hands free only); `agent.json`; `voice/sessions.py` |
| Session token to the agent | how the token reaches our endpoint | `startSession({ signedUrl, customLlmExtraBody: { session_token } })` in `@elevenlabs/react`; it arrives as `elevenlabs_extra_body.session_token` (task 1) |

**Key invariants**:
- The agent speaks only text our server wrote, except its configured first message.
- Every saved number passed spec 0006's grounding; voice adds no path around it.
- A voice turn writes through `handle_utterance` only, the same as typing.
- Auto save happens only on a clean card that did not change between plan and confirm.
- Only the last save of a notebook can be undone, within 300 s, never a correction, and never chained.
- A partial version of a turn never leaves a save behind: the newest request for a turn key wins (AC-14).
- The notebook and holder of a voice turn come only from the signed token of an active session.
- No audio is stored, at LabFlow or at ElevenLabs.

**Security model**: the session, last save, and undo routes sit behind the access gate. The Custom LLM route is reachable from the internet, so it needs the shared `VOICE_LLM_SECRET` (set on the agent as its Custom LLM key) and a session token we signed for one holder, one notebook, and one active `sid`. Both checks run before any database or model work; a stopped or expired session's token stops working, and a session runs at most 60 turns, so a leaked token has a short life and a small budget. The ElevenLabs API key stays on the server; the browser only gets a 15 minute signed URL. Transcripts are lab measurements with no personal data beyond the holder's name. The Claude call cap (spec 0006) still applies per holder.

**Configuration required**:
- `ELEVENLABS_API_KEY`: server key for signed URLs and the sync script (planned in spec 0001).
- `ELEVENLABS_AGENT_ID`: the agent for this environment (printed by `sync_agent.py`; dev and prod differ).
- `VOICE_LLM_SECRET`: shared secret the agent sends as its Custom LLM key (`openssl rand -hex 32`).
- `VOICE_LLM_URL`: the public base URL the agent calls (a tunnel in dev, the Railway URL in prod); read only by the sync script. Rerun `sync_agent.py` whenever it changes.
- `ELEVENLABS_API_KEY` must be the secret value (starts with `sk_`), not the key id, with ElevenAgents write access.
- `ELEVENLABS_STT_MODEL` (spec 0001) is no longer used.
- Prerequisites: an ElevenLabs Starter plan; the Railway deploy fixed (`ACCESS_CODES`, `SESSION_SECRET` set); a dev tunnel with a fixed URL (recommended: ngrok with its free fixed domain; `cloudflared` quick tunnels are blocked on the Uniandes network, and `localhost.run` without an account drops and changes its URL); spec 0004 Slice A built.

**Critical test scenarios**:
- Happy path: hands free on `/`, say "Ensayo 7, temperatura sesenta y cinco grados, duración veinte minutos, rendimiento setenta y cuatro por ciento" → "Guardado ensayo 7: 65 °C, 20 min y 74 %. Di deshacer para quitarlo.", "Último" shows trial 7, no card, verifies **AC-1**, **AC-3**, **AC-4**, **AC-5**, **AC-20**
- Unsure path: "Ensayo 8, 2 horas" → the card shows with the conversion flag and it asks out loud, verifies **AC-5**, **AC-6**
- Race: a hand edit lands between plan and confirm → nothing saved, the question is spoken, verifies **AC-5**
- Undo: "deshacer" within 5 min → trial gone, proposal `undone`; a second "deshacer", after 5 min, after another save, or after a previous undo → "No hay nada que deshacer."; "bórralo" with a card pending discards the card, verifies **AC-7**
- Brain failure: the fake provider fails → the fixed message is spoken, card unchanged; saying it again runs a new turn, verifies **AC-12**, **AC-14**
- Replay: the same request twice, and two at once → one save, the same reply; turn 61 → the limit reply, verifies **AC-14**
- Partial turn: "Ensayo 7, 65 grados, 20 minutos, 74 por ciento" auto saves, then the same turn key arrives as "… 74 por ciento, no, 76" → the first save is undone and the newest sentence decides; a superseded request that had not written leaves nothing, verifies **AC-14**
- Auth: no bearer, wrong bearer, expired, forged, or ended token → 401, nothing stored; the session route without a cookie → 401, verifies **AC-13**
- Failure to start: ElevenLabs returns an error → error state, the text field focused, typing works, verifies **AC-11**

## Build plan

Skateboard (the project default): prove the voice loop end to end first with the least UI, then grow it into the main page, then polish. Task 1 is a proof on purpose: facts the docs do not confirm decide whether the rest holds.

1. **Proof of the Custom LLM loop** (dev only). **Done 2026-10-29** for (a), (b), (e) and the voice id; (c) and (d) still open (findings in rationale.md, *Task 1 findings*). `api/voice/agent.json`, `scripts/sync_agent.py`, a dev agent pointed at a tunnel, and a bare endpoint that logs the incoming body and streams a fixed reply. With a real Spanish call, confirm: (a) the last `user` message is the raw transcript; (b) the React SDK option that carries the session token into the request (or the fallback); (c) how Spanish speech to text writes "setenta y cuatro coma cinco" (words, "74,5", "74.5"), and that `services/numbers.py` reads every form seen; (d) whether muting on release ends a hold to talk turn quickly; (e) the retention, system tool, and turn setting names. Pick the voice id. If (a) or (b) fails, stop and route to `/architect` before going on, satisfies **AC-3**, **AC-8**, **AC-15**, **AC-16**
2. **Brain behind the endpoint**. **Done 2026-10-29** (the DELETE session route landed here too, so an ended token can be tested). session token, secret check, `OPEN_PATHS`, the session set and 60 turn cap, SSE chunks and the non streaming answer, the 1.5 s filler, `handle_utterance(source="voice")`, the AC-12 message, the replay cache with in flight waits, newest wins for partial turns (needs task 3's undo for a superseded auto save; until task 3, a superseded turn only skips its write), logs; pytest with the fake provider, satisfies **AC-3**, **AC-4**, **AC-12**, **AC-13**, **AC-14**, **AC-15**, **AC-17**
3. **Auto save and undo**: migration (`undone` in `ck_proposal_status`), `ProposalStatus.UNDONE` and its readers, `is_clean` and the `Confirm` step with the unchanged card check, `services/undo_rules.py`, `repositories/proposals.undo_last` and `last_save`, the four new reply reasons, the two capture routes, `make openapi`; pytest for clean vs flagged, the race, the window, no chain, a correction never undone, discard vs undo, satisfies **AC-5**, **AC-6**, **AC-7**
4. **Session routes and the main page** (needs spec 0004 Slice A): `POST` and `DELETE /api/voice/session`, `@elevenlabs/react` in `useVoiceSession`, start and stop, live words, the AC-20 refetches, the saved notice with Deshacer, the caps (silence timer, tab hidden, notebook change), failure states with the text field fallback; Vitest with a mocked conversation, satisfies **AC-1**, **AC-2**, **AC-5**, **AC-9**, **AC-10**, **AC-11**, **AC-20**
5. **Hold to talk**: the "Manos libres · Mantener" switch, `localStorage`, muting on spec 0004's press rules, per the task 1 finding (d), satisfies **AC-8**
6. **Prod agent and deploy**: `sync_agent.py --env prod`, Railway variables, a recorded demo run on the deployed app with the latency median, satisfies **AC-16**, **AC-17**
7. **Phone and accessibility pass**, satisfies **AC-18**
8. **Notebook page dock** with the same session, satisfies **AC-19**

## Consequences

**Positive**:
- You get a real two way voice conversation (and learn the ElevenLabs Agents platform) without giving up the rule that code checks every number.
- Voice reuses the whole capture pipeline (grounding, flags, replies), so typed and spoken behave the same.
- Clean readings no longer need a confirm, which answers the pitch feedback on confirmation fatigue; undo covers the risk.

**Negative / tradeoffs**:
- Grounding protects against the model, not against speech to text: if "sesenta y cinco" is heard as "sesenta y ocho", the reading is grounded in that transcript and saves as clean. Reading the values back (AC-5) and the five minute undo are the only guard; range checks catch only far misses.
- Every voice turn depends on two internet services (ElevenLabs and Railway) plus a public endpoint; local dev needs a tunnel and a dev agent.
- It costs money per minute (Starter, 75 minutes, $0.08 per extra minute).
- Building Agent first for tomorrow risks having no voice in the demo if task 1 fails; typing stays the backup.
- Undo deletes rows; a save older than 5 minutes cannot be removed until feature 14.
- Typed and voice paths differ (typed still confirms every card) until spec 0006 adopts the same clean rule.
- The replay cache and session set are in memory: a redeploy mid session ends the session (the token is no longer active).

**Neutral**:
- `ELEVENLABS_STT_MODEL` and the planned Scribe client from spec 0001 are dropped.
- `@elevenlabs/react` and the `elevenlabs` Python SDK join the dependencies.
- LangGraph stays out of capture; it is a candidate for feature 10, in its own spec.

## Follow-up

- [ ] Spec 0004: mark Slice B criteria AC-6 to AC-10 as governed by spec 0007 for voice; Slice A stays the prerequisite.
- [ ] Spec 0001: point its speech to text row at spec 0007.
- [ ] Spec 0006: align the teammate's "card only when unsure" change with AC-5 (same `is_clean` for typing) and update its "nothing is saved without a confirm" invariant.
- [ ] Fix the Railway deploy (`ACCESS_CODES`, `SESSION_SECRET`) before task 6; the Custom LLM must be public.
- [ ] `/architect questions about the data` (feature 10): decide whether LangGraph runs that multi step agent.
- [x] Task 1 passed (a) and (b), so the Scribe fallback (rationale.md, Option 3) is not needed.
- [ ] Task 1 fact (c): one call saying "setenta y cuatro coma cinco"; record the written form and check `services/numbers.py` reads it.
- [ ] Task 1 fact (d): a hold to talk call (mute on release); may move into task 5. Until then hold mode stays "Mantener (beta)" (AC-8).
- [ ] Pick a Latin American neutral Spanish voice before the demo, or keep `EXAVITQu4vr4xnSDxMaL`.
- [ ] Set up a dev tunnel with a fixed URL (ngrok free domain) so the dev agent stops needing a resync.
- [ ] Spec 0006 follow-up still open: check a flagged value by repeating it out loud.
- [ ] Voice conventions belong in a nested `api/app/voice/AGENTS.md` once built (`/sync`).
- [ ] Record in `AGENTS.md` `## Agent skills` (`/sync`): `agents` (`elevenlabs/skills`, `.claude/skills/agents/`, voice area); MCP servers: ElevenLabs (`elevenlabs-mcp`, connected by the engineer); declined: `jezweb/claude-skills` elevenlabs-agents, the Cloudflare tunnel skills.
