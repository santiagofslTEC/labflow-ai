# ElevenLabs Agents for a voice lab notebook (research, 2026-10-29)

Scope: read-only research. Budget used: 5 web searches, 8 page fetches. Items marked UNCONFIRMED were not verified on a doc page.

## 1. Custom LLM (our server as the agent brain)
- Yes. Agent LLM dropdown: "Custom LLM", then server URL and model ID. Source: https://elevenlabs.io/docs/eleven-agents/customization/llm/custom-llm
- Must be OpenAI compatible: Chat Completions (`/v1/chat/completions`) or Responses API (`/v1/responses`).
- Request body: OpenAI style with `messages`, `model`, `temperature`, `max_tokens`, `stream`; roles `system`, `assistant`, `user`. Same page.
- UNCONFIRMED: whether the user message is the raw STT transcript. The page is silent. Test it with a real call before relying on it.
- Extra params: go in `elevenlabs_extra_body` in the request body. Our server must strip it before forwarding. Set per conversation from the client via the SDK's initiation data (Python SDK shows `ConversationInitiationData(extra_body=...)`). The page does not mention headers or dynamic variables for this. A notebook id is probably best sent through dynamic variables or initiation data (UNCONFIRMED for the browser SDK).
- Streaming: required in practice. Response must be `text/event-stream`. Chat chunks are `data: {json}\n\n`, ending `data: [DONE]\n\n`. Responses API uses `event:` + `data:` lines with `response.output_text.delta` and `response.completed`.
- Latency: no timeout value stated. Options: send an initial chunk ending in "... " for slow models, or use the agent's soft timeout (see section 4).
- Limits: custom LLM cannot be used with a Realtime model. System tools (end_call, language_detection, skip_turn) are passed in `tools`; the model must support OpenAI-format function calling.
- Reasoning text must be returned separately (`reasoning` / `reasoning_content`) if "Reasoning summary" is enabled.
- Implication for us: our chain must finish (or stream) its reply before ElevenLabs speaks it. Our number checks must run inside that path, so they add latency. Keep the reply short.

## 2. Server tools (webhook), client tools, code tools
- Tool types: client tools (run in our browser), webhook tools (HTTP call to our API), code tools (JS sandbox on ElevenLabs), MCP tools, system tools. Source: https://elevenlabs.io/docs/eleven-agents/customization/tools
- Client tools: registered in our code. Option "Wait for response" returns the result to the agent. Source: https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools (from search; not fetched).
- Webhook tool params are filled by the LLM from its own reasoning. Nothing confirmed lets us force the exact user transcript into an argument. A March 2026 changelog added a conversation-history system variable and configurable webhook content type (JSON or URL-encoded). Source: https://elevenlabs.io/docs/changelog/2026/3/23 (search snippet only). A webhook could read history, but that is UNCONFIRMED.
- Implication: tools are a weak fit for "every number checked against the exact words". Option A (custom LLM) gives us the text directly.
- Latency/timeout for webhooks: not found.

## 3. Browser connection
- Package: `@elevenlabs/react` (re-exports `@elevenlabs/client`). Major version not shown on the page. The search blog says "ElevenAgents React SDK v1.0", a breaking change that keeps `useConversation` (needs a `ConversationProvider` ancestor). Source: https://elevenlabs.io/docs/eleven-agents/libraries/react and https://elevenlabs.io/blog/elevenagents-react-sdk-v1-0 (blog not fetched). May be stale: check npm.
- `startSession` takes `agentId` (public agents only), `signedUrl` (WebSocket), or `conversationToken` (WebRTC). Connection type is inferred: voice uses WebRTC, text uses WebSocket by default. `connectionType` exists but is undocumented on this page.
- Private agents: our server calls `GET https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=...` with `xi-api-key`. Signed URL valid 15 minutes; the conversation must start in that window. Requires the agent's `platform_settings.auth.enable_auth = true`. Source: https://elevenlabs.io/docs/eleven-agents/customization/authentication
- WebRTC conversation token: the auth page does not cover it. Our server would fetch it with the API key. Endpoint name UNCONFIRMED.
- Hook return values: `status` (disconnected/connecting/connected), `isSpeaking`, `isListening`, `mode`, `isMuted`, `setMuted`, `canSendFeedback`, `message`. Methods include `sendUserMessage` and `sendUserActivity` (signatures not fetched).

## 4. Turn taking
- Automatic VAD / turn model. Settings (dashboard Advanced / Agent settings; API `conversation_config.turn.*`): `turn_timeout` (1-30 s, "Take turn after silence"), `turn_eagerness` ("patient" | "normal" | "eager"), `soft_timeout_config` (filler phrase while LLM is slow; `timeout_seconds` 0.5-8.0, default disabled, recommended 3.0). Source: https://elevenlabs.io/docs/eleven-agents/customization/conversation-flow
- Max call length: `conversation_config.conversation.max_duration_seconds` (default 600, range 60-7200). Same page.
- Interruptions: enabled through the "interruption" client event (Advanced tab).
- Mute: `isMuted` / `setMuted` on the hook (see section 3). Hold-to-talk could be built by muting and unmuting on pointer or key events. This is our design, not a documented ElevenLabs mode.
- Push-to-talk or a "manual turn" mode: NOT found in the React SDK page or the turn-taking page. Treat as unsupported until confirmed.

## 5. Spanish, language, and STT tuning
- Not confirmed. The overview page says "31 languages" in one place and "70+ languages" in another (no detail). Spanish, the agent language setting, and the agent STT model name were not found. Source checked: https://elevenlabs.io/docs/eleven-agents/overview
- Keyterms / vocabulary boost for agent STT: not found. Scribe realtime (separate product) reportedly takes keyterms as query params (search snippet, UNCONFIRMED).
- Check the "Voice & language" guide: https://elevenlabs.io/docs/eleven-agents/customization/voice (not fetched; out of budget).

## 6. Live transcript events in the browser
- Yes. `useConversation` `onMessage` receives tentative and final user transcriptions, agent replies, and debug messages. Source: https://elevenlabs.io/docs/eleven-agents/libraries/react
- `onAgentChatResponsePart` gives start/delta/stop events for the agent's reply text (for voice, needs `agent_chat_response_part` in client events).
- No separate `onUserTranscript` callback listed. Our UI can use `onMessage` and check the fields (UNCONFIRMED exact shape).

## 7. Pricing and limits
- Free plan: 15 agent minutes included, 4 concurrent calls. Source: https://elevenlabs.io/pricing/agents
- Starter: $6/month (first month $1, dated "Until Nov 1"; may be stale), 75 call minutes included, 6 concurrent calls, $0.08 per extra minute, burst $0.16/min above concurrency. Same page.
- LLM usage billed separately (deducted from credits, varies by model). Same page.
- Caveat: pricing page cache date unknown. Check https://elevenlabs.io/pricing/agents before deciding.

## 8. Scribe realtime (build-it-ourselves fallback)
- Model id: `scribe_v2_realtime`. Source: https://elevenlabs.io/docs/eleven-api/guides/how-to/speech-to-text/realtime/client-side-streaming
- Browser auth: our server creates a single-use token with `realtime_scribe` type (JS: `elevenlabs.tokens.singleUse.create("realtime_scribe")`). Token expires after 15 minutes and is single use, so get one per connection. Browser passes it as `token` query param on the WebSocket.
- Events: `PARTIAL_TRANSCRIPT`, `COMMITTED_TRANSCRIPT`, `COMMITTED_TRANSCRIPT_WITH_TIMESTAMPS` (needs `includeTimestamps`). React: `useScribe` with `onPartialTranscript` / `onCommittedTranscript`. Packages: `@elevenlabs/react`, `@elevenlabs/client`, `@elevenlabs/elevenlabs-js` (server).
- Commit strategy: `MANUAL` shown in docs; `vad` is also mentioned in the realtime guide summary (UNCONFIRMED). Audio example: PCM 16 kHz.
- Latency ~150 ms claim comes from a secondary summary, not the docs. Treat as UNCONFIRMED.

## Recommendation (for the team to decide)
- Best fit for "our backend is the brain": Option A, Custom LLM. Our FastAPI route is the agent's LLM. It receives each user turn, runs our chain and number checks, and streams the reply.
- Open tests before committing: (a) raw STT text arrives as the user message; (b) how to pass notebook id; (c) Spanish voice and STT settings; (d) hold-to-talk via `setMuted`; (e) real latency with our checks in the path.
- Fallback B: Scribe realtime + our own TTS and turn control. More work, full control of turns.

## Stale / gaps
- Not verified: npm major version, WebRTC token endpoint, Spanish/keyterms for agents, push-to-talk, webhook argument behavior, Custom LLM timeouts.
- Pricing and the Starter promo may be stale.
