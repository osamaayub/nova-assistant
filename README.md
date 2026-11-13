<div align="center">

# Nova

### A voice AI assistant for your Windows PC, run by a team of agents

Talk to it, and it answers out loud from a Stonic/Jarvis-style command center. It opens apps, finds music, checks your PC, tidies Downloads, sets reminders, researches, writes and checks code, connects MCP tools, and remembers what matters to you.

**Runs free on your own PC with Ollama, free in the cloud with no key, or on Claude.**

[![CI](https://github.com/osamaayub/nova-assistant/actions/workflows/ci.yml/badge.svg)](https://github.com/osamaayub/nova-assistant/actions/workflows/ci.yml)
[![Download for Windows](https://img.shields.io/badge/Download-Windows_installer-0078D4?logo=windows&logoColor=white)](https://github.com/osamaayub/nova-assistant/releases/latest)
![Electron](https://img.shields.io/badge/Electron-44-47848F?logo=electron&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Claude](https://img.shields.io/badge/Claude-tool_use-191919?logo=anthropic&logoColor=white)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

<img src="docs/team.jpg" width="31%" alt="Nova handing a music request to its PC agent" />
<img src="docs/brain.jpg" width="31%" alt="Settings: free local AI with Ollama, free cloud, or Claude, and the team-of-agents switch" />
<img src="docs/confirm.jpg" width="31%" alt="Nova asking for permission before moving files" />

</div>

## What it can do

| Ask | What happens |
| --- | --- |
| "Open Spotify" / "Open VS Code" | Opens apps from a fixed, safe list (plus apps you add in Settings) |
| "Play some lofi music" | Opens a YouTube or Spotify search |
| "How is my PC doing?" | CPU, memory, disk space, battery and the busiest programs |
| "Tidy my Downloads folder" | Shows a plan, **asks you first**, then moves files into folders by type. Nothing is deleted |
| "Remind me in 20 minutes to stretch" | Windows notification, read out loud |
| "Write a parser for this CSV" | The coding crew plans, writes after Allow, reviews, and runs fixed checks |
| "Connect my calendar" | Uses MCP connectors from the gallery, including remote MCP URLs |
| "Who won the match last night?" | Searches the web on Claude and names its sources |
| "Remember that I prefer short answers" | Saved on your PC and used in every future chat (see and delete it in Settings) |

Pick a character (Nova, Jarvis the butler, Sage the mentor, Max the friend, or write your own), and the orb changes colour and personality. On a wide window Nova shows the command center: avatar, circuit wires, crew board and world monitor.

## Brains, your choice

| | Free local AI | Free cloud | Claude |
| --- | --- | --- | --- |
| Key needed | **No** | **No** | Your own Claude API key |
| Cost | Free | Free, rate-limited | Pay per use |
| Runs | On your PC with [Ollama](https://ollama.com), works offline | `api.jarvisclaw.ai` | Anthropic's servers |
| Privacy | Private | Chats leave your PC | Chats leave your PC |
| Web search | No (it can read a page whose address it knows) | No (same) | Yes, with sources |
| Best model | `qwen3:8b` (about 5 GB, needs 8 GB+ RAM) | `auto/free` | Sonnet 5.5 |

Switch any time in **Settings → Brain**. Free cloud is convenient but depends on a hosted service; Ollama is the private free path.

## A team of agents

Like Claude Code's subagents, Nova splits work between specialists. The main agent talks to you and hands each job to the right one:

```mermaid
flowchart LR
    U["You"] --> N["Nova (main agent)<br/>talks, decides, remembers"]
    N -- "ask_pc_agent" --> PC["PC agent<br/>apps · websites · music · timers · PC health"]
    N -- "ask_files_agent" --> F["Files agent<br/>your folders · tidy Downloads"]
    N -- "ask_architect_agent / ask_developer_agent / ask_reviewer_agent / ask_tester_agent" --> C["Coding crew<br/>plan · write · review · check"]
    N -- "ask_research_agent" --> R["Research agent<br/>web search · read pages"]
    N -- "ask_connectors_agent" --> M["Connectors agent<br/>MCP apps · remote MCP"]
    PC & F & C & R & M -- "short report" --> N
```

Each specialist sees only its task and its own tools, has a step limit, and reports in one to three sentences what worked, the tool evidence, and any blockers. Nova passes relevant findings between specialists when tasks depend on each other, checks each report before continuing, and gives you one final answer. The window shows every step under the agent that ran it. Turn **Team of agents** off in Settings for quicker one-step commands.

For complex code, Nova runs the coding crew in order: Architect plans, Developer writes after Allow, Reviewer checks read-only, and Tester runs fixed checks like `npm test`, `npm run typecheck`, `npm run lint` or `python -m pytest` after Allow.

## How it works

```mermaid
flowchart LR
    M["Hold Space<br/>(push to talk)"] --> W["Whisper<br/>speech to text, on your PC"]
    W --> A["Agent loop<br/>(main process)"]
    A <--> B["Brain<br/>Ollama, free cloud or Claude"]
    A --> T["Safe tools<br/>apps, music, files, timers, memory, code, MCP"]
    A -- "streams sentences" --> V["Voice<br/>Windows voice or Kokoro, on your PC"]
    T -- "risky step?" --> Q["Allow / Don't allow<br/>card in the window"]
```

1. **You speak.** Whisper turns your voice into text locally (no audio leaves your PC).
2. **Your brain decides.** The agent loop sends your words, Nova's character and what it remembers. The brain either answers or asks to use a tool.
3. **Tools run safely.** Each tool checks its input with Zod. Anything that changes files, sends data or runs checks asks you first. The loop stops after a step limit.
4. **Nova speaks.** Replies stream in, and each sentence is spoken as soon as it is complete.

## Safety by design

- **No raw commands.** Nova picks an app *name*. The command for it is fixed in [`apps.ts`](src/main/agent/tools/apps.ts), so text like `cmd /c del *` can never run.
- **Your folders only.** Nova's own file tools work inside Desktop, Documents, Downloads, Pictures, Music and Videos, and block `..` tricks.
- **Ask first.** Moving files, writing code, running project checks and MCP tools that change data need your click on "Allow". Nothing is ever deleted.
- **Fixed checks only.** The Tester agent can run `npm test`, `npm run typecheck`, `npm run lint` or `python -m pytest` in a project folder after Allow. It cannot run arbitrary commands.
- **MCP is contained.** Connectors run as their own processes. Read-only tools run freely; anything else asks first. Remote MCP goes through the pinned `mcp-remote` bridge.
- **Your key is encrypted** with Windows (Electron `safeStorage`) and never reaches the window.
- **Locked-down window.** Sandboxed, context isolation, a tight Content Security Policy, and microphone is the only permission granted.

## Download

Get the latest **Windows installer** from [Releases](https://github.com/osamaayub/nova-assistant/releases/latest), run it, and pick a brain in Settings. The installer isn't code-signed yet, so Windows may say "Windows protected your PC": click **More info**, then **Run anyway**.

## Free setup (no key)

Easiest: pick **Free cloud** in **Settings → Brain**. No key and no Ollama; chats go to `api.jarvisclaw.ai` and it is rate-limited.

Private free path:

1. Install [Ollama](https://ollama.com) and open it.
2. In a terminal: `ollama pull qwen3:8b`
3. Install Nova, open **Settings → Brain**, keep **Free local AI**, and click **Check connection**.

## Connectors

Open **Settings → Connectors** to add MCP apps. The gallery has ready-made connectors for files, code docs, step-by-step thinking and browser control. You can also add a custom stdio MCP server, or a remote MCP URL through `mcp-remote` for OpenAI-style tool endpoints. Anything that changes data asks you first.

## Run it from the code

You need [Node.js 22+](https://nodejs.org), plus Ollama, free cloud, or a [Claude API key](https://console.anthropic.com).

```bash
git clone https://github.com/osamaayub/nova-assistant.git
cd nova-assistant
npm install
npm run dev
```

Then hold **Space** to talk. **Alt+Space** shows or hides Nova from anywhere.

The first time you talk, Nova downloads the Whisper speech model (about 80 MB). If you pick the natural Kokoro voice, that downloads once too (about 90 MB). Both are cached after that.

**Make an installer:** `npm run build:win` creates `dist/nova-assistant-<version>-setup.exe`. The Release workflow does this on GitHub and attaches it to a release.

## Costs

With Ollama or free cloud, Nova has no API bill. Free cloud is rate-limited and hosted. With Claude, every message is an API call, and team mode makes a few calls per request. With **Sonnet 5.5** and short spoken replies, a typical command costs a fraction of a cent. **Haiku 5.5** is cheaper and faster, and **Opus 5.5** is smarter but slower. Web search adds $10 per 1,000 searches. You can turn it off in Settings.

## Project structure

```text
src/
├── main/                       # Node side: the agent and everything that touches your PC
│   ├── agent/
│   │   ├── loop.ts             # The agent loop for any brain: stream, run tools, step limit, history
│   │   ├── team.ts             # The team: PC, Files, coding crew, Research, Connectors
│   │   ├── providers/          # claude.ts, ollama.ts, flm.ts (free cloud)
│   │   ├── types.ts            # Nova's own message format and the Provider interface
│   │   ├── prompt.ts           # Characters and the system prompt
│   │   ├── service.ts          # One conversation: picks the brain, runs the team, "Allow?" questions
│   │   └── tools/              # apps, web, system, files, memory, code, mcp
│   ├── mcp/                    # MCP client and manager for connector servers
│   ├── remote/                 # Phone link / remote page server
│   ├── memory/store.ts         # Facts about you in SQLite (sql.js, no native install)
│   ├── settings/               # Settings file + encrypted API key
│   ├── platform.ts             # The real Windows actions (open, launch, notify)
│   └── index.ts                # Window, permissions, IPC, Alt+Space
├── preload/index.ts            # The only functions the window may call
├── renderer/src/               # The window (React)
│   ├── features/chat/          # Transcript, tool steps, Allow card
│   ├── features/crew/          # Agents-at-work board and agent figures
│   ├── features/command/       # Command center, avatars, circuit wires, Stonic screen
│   ├── features/monitor/       # World monitor globe and headlines
│   ├── features/voice/         # Push to talk, Whisper worker, Windows/Kokoro voices, wake word
│   ├── features/orb/Orb.tsx    # Three.js particle orb
│   └── features/settings/      # Brain, key, character, voice, apps, memory, connectors
└── shared/types.ts             # Types both sides share
test/                           # Agent loop, providers, team, tools, MCP, memory (Vitest)
```

## Development

```bash
npm test            # agent loop, providers, team, tool safety, MCP, memory, connectors
npm run typecheck   # TypeScript (main and window)
npm run build:win   # Windows installer
```

## Built by a team of agents, too

Like JS Mastery's Askwell, this repo is set up for a team of AI coding agents: [`CLAUDE.md`](CLAUDE.md) holds the team rules, [`docs/project.md`](docs/project.md) says what to build and [`docs/plan.md`](docs/plan.md) gives the phases, each split into two parallel lanes.

Shipped so far: team of agents, free local and free cloud brains, coding crew, MCP connectors including remote MCP, wake word and start-with-Windows, crew board, command center, world monitor, phone link and WhatsApp send.

## Author

Built by [Osama Ayub](https://github.com/osamaayub), full-stack developer (React, Next.js, Node.js, AI integration). Inspired by desktop assistants like JARVIS; all code and design here are original.

## License

[MIT](LICENSE)
