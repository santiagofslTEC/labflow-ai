# 0007. Voice conversation: rationale

## Context

> ⚠️ Premise note: this is asked for tomorrow's demo, but it stands on three things that are not in place today: the typed main page (spec 0004 Slice A) is not built, the Railway deploy has failed since 2026-10-28 (missing `ACCESS_CODES` and `SESSION_SECRET`), and the ElevenLabs docs do not confirm that the Custom LLM receives the raw transcript. A full spoken conversation is a large feature to land in a day. The build plan therefore starts with a proof slice that can stop the design early, and the demo should keep typed capture ready as the backup. If time runs short, the notebook page (where typed capture already works) is a faster place to show voice than `/`.

LabFlow is a voice first lab notebook: students dictate measurements in Spanish with their hands busy. Spec 0001 planned speech to text with ElevenLabs Scribe and a plain tool loop in FastAPI ("no LangGraph"). Spec 0006 built the capture turn: one sentence in, one checked tool call, code grounds every number in the user's words, and the card asks before saving. Spec 0004 designed the main page around a hold to talk mic with live words.

The engineer now wants a full spoken back and forth (LabFlow answers out loud and asks follow ups), wants to learn ElevenLabs Agents and LangGraph, and wants the verification card to appear only when LabFlow is unsure (pitch feedback: confirming every reading leads to tapping yes without reading). Both hands free and hold to talk must work, because labs are noisy and hands are busy.

The forces: the "no invented numbers" promise must survive (every spoken and saved number checked by code), latency must stay within 5 s from the end of speech (RNF-02), typing must keep working when voice fails (RNF-09), the API key stays on the server, no audio is stored, and the team is two students with a demo on Friday 2026-10-30 and a small budget.

## Options considered

### Option 1: ElevenLabs Agent, our server as Custom LLM

The agent handles microphone audio, speech to text, turn detection, interruptions, and text to speech. Its "LLM" is our endpoint: ElevenLabs posts the conversation in OpenAI chat format and we stream back our reply (basis: spec 0006's turn service, built to take `source`).

**Pros**:
- Our code stays the only brain; the agent cannot speak a number we did not write.
- Turn taking, interruptions, and natural speech come for free.
- Teaches the Agents platform, which the engineer wants.

**Cons**:
- Needs a public HTTPS endpoint (tunnel in dev, Railway in prod) and a second agent for dev.
- Whether the user message is the raw transcript is not documented; a proof is needed.
- Per minute cost; vendor lock on the voice layer.

### Option 2: ElevenLabs Agent with its own LLM and webhook tools

The agent's built in LLM runs the conversation and calls our API as tools (`registrar_medicion`, `guardar`).

**Pros**:
- The most "agentic" setup and the least server code for conversation flow.
- Works with the agent's richest features (system tools, knowledge base).

**Cons**:
- The agent's LLM fills tool arguments from its own reasoning, so the user's exact words are not guaranteed to reach our grounding; it can also say numbers in its own words before our checks run. This breaks the core promise.
- Two models in the loop add latency and cost.

### Option 3: Build it ourselves: Scribe realtime, our turn, ElevenLabs text to speech

The browser streams audio to Scribe realtime with a single use token, sends the committed transcript to our existing route, and plays our reply through ElevenLabs text to speech.

**Pros**:
- Full control, works on localhost, matches spec 0001 and 0004's design.
- Each piece is simple and well documented (`scribe_v2_realtime`, `useScribe`).

**Cons**:
- Turn taking, interruptions, and echo handling are ours to build; a real conversation is much more work.
- Does not use the Agents platform the engineer wants to learn.

## Rationale

The deciding force is the "no invented numbers" promise. Option 2 lets a second model choose what reaches our checks and what gets said, which reopens exactly the failure the product exists to prevent. Option 3 keeps control but makes the team build conversation mechanics (turns, barge in, playback) the week of the demo. Option 1 splits the work at the right seam: ElevenLabs does what it is best at (hearing and speaking Spanish, taking turns), and our server keeps every decision about numbers. Spec 0006's turn service already takes `source`, so the voice path is a thin adapter.

The engineer chose "save clean readings at once" for voice ahead of the spec 0006 change being designed in parallel. That is the right call for a spoken flow (reading every value back and waiting for "sí" doubles every turn), but it only stays safe because "clean" is defined by code (grounding and flags), never by the model's confidence, and because an undo exists. The undo is deliberately narrow (last save, 5 minutes counted from the confirm, never a correction, never chained) so it needs no soft delete and no change to how every read filters rows. Five minutes rather than two because the user hears the reply a few seconds after the save and may not react at once.

**Build order.** An independent cross check suggested shipping Option 3 first for the demo (Scribe hold to talk into the existing typed route, with text to speech of our reply: deterministic turn endings, no public endpoint, no tunnel) and the Agent second. That is the lower risk path for a demo tomorrow. The engineer chose Agent first, to learn the platform and show a real conversation; that is a fair call as long as build task 1 runs first and is allowed to stop the plan, typing stays the demo backup, and Option 3 remains the documented fallback.

**Cross check (2026-10-29).** A read only review on another model raised 22 gaps (turn finished signal, auto save inside the plan with a race check, undo locking and chaining, a code word match instead of a model tool for "deshacer", system tools, the first message, token transport, replay keys and in flight waits, session caps and revocation, testable restatements of the criteria) and 5 soundness notes. All were applied to `index.md`.

**Task 1 findings (2026-10-29).** A real Spanish call on the dev agent, through the `localhost.run` tunnel, with the probe endpoint echoing "Te oí: …":
- (a) The last `user` message is the raw transcript, and the whole history comes along (roles `system, assistant, user, assistant, user`). Request keys: `elevenlabs_extra_body`, `max_tokens`, `messages`, `model`, `stream` (true), `stream_options`, `temperature`.
- (b) `customLlmExtraBody` in `startSession` reaches us as `elevenlabs_extra_body.session_token`, and the token verifies. No fallback needed.
- (e) Setting names, read back with `sync_agent.py --show`: `prompt.custom_llm` (`url`, `model_id`, `api_key.secret_id`, `api_type`), `prompt.built_in_tools` (all null), `turn.turn_eagerness`, `turn.turn_timeout`, `turn.silence_end_call_timeout`, `platform_settings.privacy`, `platform_settings.overrides.custom_llm_extra_body`, `platform_settings.auth.enable_auth`. The agent's `client_events` include `user_transcript` and `agent_response`, so the browser gets both texts.
- The Custom LLM `url` is a base: ElevenLabs appended `/chat/completions` and got 404s until `LLM_PATH` became `/api/voice/llm`.
- `zero_retention_mode` needs `retention_days` -1 and is refused with a Custom LLM. The other privacy settings keep AC-15.
- Speech to text was accurate on whole numbers and units ("temperatura subió a 50 grados y el rendimiento ahora es 20 %"). The first reply text arrived 0.1 to 0.7 s after the user text in the browser (echo only, no model).
- **Partial turns.** In one long turn ElevenLabs called us three times with a growing sentence, even with `speculative_turn` false, and spoke only the last reply. The original replay key (with the sentence hash) treated each version as a new turn, so a complete early version could auto save. The engineer chose "newest wins" (AC-14): the turn key drops the hash, a newer version cancels an older one before it writes, and undoes it if it already saved. Rejected: a settle delay on every turn (adds about 0.8 s to each turn and still misses long pauses), and never auto saving by voice (gives up AC-5).
- Dev tunnel: `cloudflared` quick tunnels are reset by the Uniandes network; `localhost.run` worked but dropped twice and changed its URL, which silently broke the agent until a resync.
- Open: (c) decimal dictation and (d) hold to talk release timing.

LangGraph does not fit capture: spec 0001 kept code in charge of state and the save rule, and capture is one decision per sentence. It does fit a multi step "questions about the data" agent (feature 10), which is where the engineer wants it; that gets its own spec.

## References

**Project sources**:
- Spec 0001 (stack: Scribe from FastAPI, plain tool loop with no LangGraph, key on the server)
- Spec 0004 (main page, press rules, live words, failure states)
- Spec 0006 (turn service with `source`, grounding, flags AC-23, reply reasons)
- `AGENTS.md` (layering, typed results, one error shape)
- `docs/.agent-cache/research/elevenlabs-agents-voice.md` (the landscape check for this spec)

**Practices & standards**:
- Code owns state, the model proposes (spec 0001)
- Idempotent retries for side effects (the AC-14 replay cache)
- Hard delete over soft delete for a narrow undo

**Links** (checked during the design conversation):
- Custom LLM: https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm
- Tools: https://elevenlabs.io/docs/eleven-agents/customization/tools
- React SDK: https://elevenlabs.io/docs/eleven-agents/libraries/react
- Authentication and signed URLs: https://elevenlabs.io/docs/eleven-agents/customization/authentication
- Conversation flow (turn timeout, eagerness, max duration): https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow
- Pricing: https://elevenlabs.io/pricing/agents
- Scribe realtime client streaming: https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming

## Round 2 diagnosis: the silent reply (2026-10-30)

**Symptom**: in production LabFlow captured values but the agent never spoke a reply.

**Evidence**:
- ElevenLabs conversation records for agent `agent_4901m66hht7jfk4rc6v3fv466ywv` (`GET /v1/convai/conversations`): every call holds the first message and the user turn, never an agent turn, and ends "Client disconnected: 1000" (a normal close from the browser).
- Railway logs, matched to call start times: the user spoke 2 to 3 s into the call, ElevenLabs called `POST /api/voice/llm/chat/completions` 7 to 13 s into the call (5 to 10 s after the student stopped), and the browser sent `DELETE /api/voice/session/{sid}` 0.7 to 2.2 s after that, before our reply was ready. Each turn logged "llm fallback started" (Ollama slower than the 1.5 s hedge).
- The engineer confirmed tapping stop after waiting in silence.
- A typed probe over the prod agent WebSocket (no turn detection) got the reply's audio 2.9 s after sending, and the reply text arrived as "Mm, Solo registro mediciones…": the filler was not spoken on its own.

**Root cause**: not a broken stream. The wait was too long and invisible: `turn_eagerness: patient` added 5 to 10 s before our turn even started, our turn added up to the 4.5 s deadline, the 4 character filler was buffered by text to speech, and the screen kept showing "Escuchando…".

**Fix**: AC-21 to AC-26 (turn settings, a speakable filler, a shorter voice hedge, a thinking state, a probe for numbers, tentative words for spec 0012). Runner up considered: Claude first for every voice turn, steadier latency but a higher cost per turn; the engineer chose the shorter hedge.
