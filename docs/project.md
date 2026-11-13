# Project: Nova

A voice AI assistant for Windows. You hold Space, talk, and Nova answers out loud and does things on your PC. It runs free on your own computer (Ollama) or on Claude.

This file is the source of truth for **what** we build. `docs/plan.md` says **in what order**.

---

## 1. Users

| User | What they do |
|---|---|
| **Owner** | Installs Nova, picks a brain, talks to it, approves risky actions, edits settings and memory |

## 2. Core flow

1. Install Nova. Open it. The orb appears.
2. Pick a brain: free local AI (Ollama, no key) or Claude (own key).
3. Hold Space: "Open Spotify and play some lofi." Nova's PC agent opens the search. Nova says so out loud.
4. "Tidy my Downloads." The Files agent shows a plan. You click Allow. Files move into folders.
5. "Remember that I prefer short answers." Close Nova. Reopen it. It still knows.

## 3. Stack

| Layer | Tool | Notes |
|---|---|---|
| App | Electron + React + TypeScript | Sandboxed window, strict CSP, microphone is the only permission |
| Brains | `Provider` interface | Claude (`@anthropic-ai/sdk`, tool use, web search) and Ollama (`/api/chat`, local, free) |
| Agents | `runTurn` loop + team | Main agent hands jobs to specialists (§5) |
| Voice in | Whisper base.en (transformers.js) | Runs in a web worker on the PC |
| Voice out | Windows voices or Kokoro 82M | Kokoro runs locally in a web worker |
| Memory | SQLite (sql.js) | Facts about the user, stored on the PC |
| Secrets | Electron `safeStorage` | The Claude key is encrypted with Windows and never reaches the window |
| Tests | Vitest | Fake providers and a fake platform, no network, no Windows needed |

**Constraint:** Nova must work with no paid service at all (Ollama). Paid brains are optional.

## 4. Brains

| | Ollama (default) | Claude |
|---|---|---|
| Cost | Free | Pay per use (own key) |
| Runs | On the PC, offline | Anthropic's servers |
| Web search | No (can read a page by address) | Yes |
| Speed and quality | Depends on the PC and model | Fast, strongest |
| Recommended model | `qwen3:8b` | `claude-sonnet-5-5` |

## 5. Team of agents

| Agent | Does | Tools |
|---|---|---|
| **Nova (main)** | Talks to the user, decides who does the job, keeps memory | `ask_pc_agent`, `ask_files_agent`, `ask_research_agent`, `remember_fact`, `forget_fact`, `get_datetime` |
| **PC agent** | Apps, websites, music, timers, PC health | `open_app`, `open_website`, `play_music`, `system_status`, `set_timer`, `get_datetime` |
| **Files agent** | The user's folders, tidying Downloads | `list_folder`, `open_folder`, `organize_downloads` |
| **Research agent** | Current facts | Claude web search, `read_web_page`, `get_datetime` |

Rules: a specialist sees only its task (not the chat), gets at most 6 steps, and reports back in 1–3 sentences with tool evidence and any blockers. Nova includes needed context in every handoff, waits for reports before starting dependent tasks, and checks results before reporting success. Only the main agent speaks to the user. "Team mode" can be turned off in Settings; then one agent has every tool.

## 6. Safety

| Rule | Detail |
|---|---|
| Apps | Only from a fixed list or apps the owner added by path |
| Web | `open_website` and `read_web_page` accept public http(s) only; `read_web_page` blocks localhost and private networks |
| Files | Only inside Desktop, Documents, Downloads, Pictures, Music, Videos. No `..`. Never delete or overwrite |
| Confirm | Moving files needs the owner's Allow click |
| Memory | Never stores passwords, card numbers or secrets |
| Limits | 8 steps for the main agent, 6 per specialist |

## 7. Design

Dark, calm, one focus: the particle orb. It breathes when idle, leans in while listening, swirls while thinking, pulses while speaking. Each character has its own orb colors and a consistent conversational voice. The assistant uses remembered details when they help. Steps appear under the reply, labelled with the agent that ran them.
