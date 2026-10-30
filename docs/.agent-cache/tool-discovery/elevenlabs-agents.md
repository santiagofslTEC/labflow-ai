# Tool discovery: ElevenLabs Agents, @elevenlabs/react, ElevenLabs Python SDK, cloudflared

Date: 2026-10-29
Method: `npx -y skills find <query>` for each query; `npx -y skills add <owner>/<repo> --list` to confirm (list only, nothing installed); web search for MCP servers.
Excluded as already installed or known: elevenlabs/skills@speech-to-text, fastapi, sqlmodel, shadcn, supabase-postgres-best-practices, vercel-react-best-practices, use-railway.

## ElevenLabs Agents / SDKs

| Candidate | Skill | Covers | Confirmed |
|---|---|---|---|
| elevenlabs/skills | agents | Build voice AI agents: tools, workflows, procedures, via the SDKs or REST API | `skills add --list` (13 skills in repo) |
| elevenlabs/skills | realtime | Realtime models (`eleven_realtime_v1_mini` / `_max`) for ElevenAgents agents | `skills add --list` |
| elevenlabs/skills | speech-engine | Custom agent runtime: WebSocket/WebRTC servers, conversation tokens | `skills add --list` |
| elevenlabs/skills | onboarding | First-time ElevenLabs setup, SDK install, test request | `skills add --list` |
| elevenlabs/skills | setup-api-key | Fixing or hand-configuring an existing API key | `skills add --list` |
| jezweb/claude-skills | elevenlabs-agents | Agent + tools + knowledge base; SDK integration (React / React Native / Swift / JS / server-side); deploy | `skills add --list` (56 skills in repo) |
| secondsky/claude-skills | elevenlabs-agents | ElevenLabs agents (search result, 124 installs) | search result only; `--list` did not finish, so not confirmed |

Gaps: no skill found that is dedicated to the Python SDK or to `@elevenlabs/react` alone. The elevenlabs/skills `agents` skill says it covers "the SDKs", and the jezweb skill names React as an SDK target. Neither is a standalone SDK skill.

## Cloudflare tunnels (cloudflared)

| Candidate | Skill | Covers | Confirmed |
|---|---|---|---|
| okou-ai/okou-skills | cloudflare-tunnel | Cloudflare Tunnel (891 installs) | search result; `--list` was started in the background and had no output at the time of writing |
| dmmulroy/cloudflare-skill | cloudflare | Broad Cloudflare platform skill (Workers, storage, AI, networking incl. Tunnel) (398 installs) | search result; listing text was seen in the background output, but the owner/skill mapping is not verified |
| antoniolg/agent-kit | cloudflared-tunnel | Quick Tunnels for temporary public URLs to localhost (7 installs) | search result; listing text seen but owner mapping not verified |

Note: the quick-tunnel skill is for preview URLs. A persistent tunnel for the Railway API would need a different skill, or the docs.

## MCP servers

- ElevenLabs: official server at https://github.com/elevenlabs/elevenlabs-mcp (web search; third-party mirrors agree).
  - Install: `pip install elevenlabs-mcp`, then `python -m elevenlabs_mcp --api-key=<key> --print` for a client config block.
  - Or: `uvx elevenlabs-mcp` with `ELEVENLABS_API_KEY` set in the client config.
  - Requires an ElevenLabs API key. Not verified against the repo README in this session.
- Cloudflare:
  - Hosted official remote MCP: `claude mcp add cloudflare --transport http https://mcp.cloudflare.com/mcp` (OAuth sign-in on first connect). Source: mcpservers.org listing. Enterprise DNA's listing describes a scoped API token instead, so auth method is unverified.
  - Open-source server: https://github.com/cloudflare/mcp-server-cloudflare (G2 listing; repo not fetched).
  - cloudflared itself: https://github.com/cloudflare/cloudflared (CLI, not an MCP server).
  - Third-party only: cloudflare-dns-cloudflared-mcp (manages DNS, tunnels and Access apps). Not from Cloudflare.

## Not done

- No install was performed. Nothing was added to `.claude/skills`.
- The secondsky and okou `--list` checks did not finish, so those two are search results only.
