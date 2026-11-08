# Plan

The build order for Nova. `docs/project.md` describes each feature.

## Rules

- Build phases in order. Each phase after Phase 0 has two lanes so two developers never wait on each other.
- A phase is done when its PRs are merged, CI is green on Windows, and its "Done when" checks pass on a real Windows PC (the product owner runs them).
- When a step needs a key or an account, stop and ask (see `CLAUDE.md`).

---

## Phase 0 — Shell ✅

Electron + React + TypeScript app, CI on Windows, Release workflow.

**Done when:** `npm run build:win` makes an installer that opens a window.

## Phase 1 — One agent on Claude ✅

| Lane | Includes |
|---|---|
| A — Agent | Claude tool-use loop, tools, confirm step, memory, settings with encrypted key |
| B — Window | Orb, transcript, settings panel, push to talk, Whisper, Windows and Kokoro voices |

**Done when:** "Open Spotify" works by voice and Nova says it out loud.

## Phase 2 — Free brain + team of agents ✅ (v1.1.0)

| Lane | Includes |
|---|---|
| A — Brains | `Provider` interface, Claude and Ollama providers, Ollama connection check |
| B — Team | Main agent + PC, Files and Research agents, `read_web_page`, team-mode switch, agent labels in the window |

**Done when:** with no Claude key, Ollama answers "Open Spotify and tidy my Downloads" using two specialists.

## Phase 3 — Wake word + MCP

| Lane | Includes |
|---|---|
| A — Always listening | "Hey Nova" wake word (openWakeWord), tray icon, start with Windows |
| B — MCP | Connect MCP servers (calendar, email) as a new specialist; every send needs Allow |

**Done when:** "Hey Nova, what's on my calendar?" works hands-free.

## Phase 4 — Shared brain service

| Lane | Includes |
|---|---|
| A — Service | Move the agent into a FastAPI + LangGraph service with pgvector memory |
| B — Clients | Nova desktop and a small web app both use the service |

**Done when:** the same conversation continues on the desktop and in the browser.
