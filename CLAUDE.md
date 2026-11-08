# Nova — Team Rules

Nova is a voice AI assistant for Windows. A team of coding agents can build it (a lead plus developers working in parallel lanes). Every agent follows this file.

## Docs

| File | Read it for |
|---|---|
| `docs/project.md` | What we build: features, architecture, safety rules, design |
| `docs/plan.md` | The phases, in build order (human-written) |

Read only the `project.md` sections your task names.

## How to talk to the product owner

- Lead with the answer or result. No preamble, no recap.
- Short sentences, plain words, no em dashes. No paragraph over 3 sentences.
- A table for comparisons, a numbered list for steps.
- Need a decision? Ask with 2–4 options, the recommended one first and marked "(Recommended)".
- Say what you know vs. what you're guessing.

## Before you open a PR

- Run every check below. All must pass.
- PR body: what changed, how you tested it, and the task's "done when" list, each item checked or explained.
- Anything that needs Windows (voice, opening apps) can't be tested in CI. Say so in the PR and list the manual steps for the product owner.

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Run the app with hot reload |
| `npm test` | Vitest: agent loop, both brains, team, tool safety, memory |
| `npm run typecheck` | TypeScript for main and window |
| `npm run lint` | ESLint |
| `npm run build:win` | Windows installer |

## Architecture rules

| Rule | Detail |
|---|---|
| Brains are swappable | All model calls go through `Provider` (`src/main/agent/types.ts`). The loop and the team never import a provider directly. |
| One message format | Providers convert to and from `Msg`. Never leak Anthropic or Ollama shapes outside `providers/`. |
| Tools are fixed | A tool has a Zod schema and runs only fixed actions. The model picks names and values, never commands or paths outside the user's folders. |
| Ask before changing things | Any tool that moves, sends, buys or deletes calls `ctx.confirm()` first. Nothing is ever deleted. |
| Specialists stay narrow | A specialist gets only its own tools and a fresh, short conversation. Specialists never hand work to other specialists. |
| Main vs window | Node code lives in `src/main`. The window (`src/renderer`) only calls the functions in `src/preload`. No new IPC channel without a type in `src/shared/types.ts`. |

## When you must stop and ask

| Situation | Do |
|---|---|
| A new tool can change or delete user data, send messages or spend money | Stop. The product owner approves the tool and its confirm step. |
| You need to change `src/shared/types.ts` or the `Provider` interface | Stop. That's a contract change. The lead plans it. |
| You need an API key, an account or a sign-in | Stop. Say what you need and where it goes. Never put a key in code, tests or chat. |
| The task conflicts with `project.md` | Stop. Ask. Don't guess. |

## Never

- Never run model output as a shell command.
- Never add `console.log`. Errors go to the user as one plain sentence (`friendlyError`).
- Never push to `main` or merge your own PR.
