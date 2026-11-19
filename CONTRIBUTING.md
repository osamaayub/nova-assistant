# Contributing to Nova

Thanks for helping. Nova is a Windows voice assistant built around a few hard rules, so read this first.

## Set up

Needs [Node.js 22](https://nodejs.org) (see `.nvmrc`) on Windows.

```bash
git clone https://github.com/osamaayub/nova-assistant.git
cd nova-assistant
npm install
npm run dev
```

## Checks (all must pass before a PR)

| Command | Does |
| --- | --- |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript for main and window |
| `npm test` | Vitest, no network and no Windows APIs needed |
| `npm run build:win` | Windows installer (optional locally, CI builds it) |

CI runs the same checks on every pull request. Voice, app launching and the installer cannot run in CI. If your change touches them, list the manual steps in the PR.

## Rules that decide whether a PR is accepted

1. **Brains are swappable.** Model calls go through `Provider` (`src/main/agent/types.ts`). The loop and the team never import a provider directly.
2. **One message format.** Providers convert to and from `Msg`. Never leak Anthropic or Ollama shapes outside `providers/`.
3. **Tools are fixed.** A tool has a Zod schema and runs fixed actions. The model never supplies a command or a path outside the user's folders.
4. **Ask before changing things.** A tool that moves, writes, sends or buys calls `ctx.confirm()` first. No tool deletes anything.
5. **Specialists stay narrow.** A specialist gets only its own tools and a short conversation, and never hands work to another specialist.
6. **Main vs window.** Node code lives in `src/main`. The window (`src/renderer`) only calls functions from `src/preload`. A new IPC channel needs a type in `src/shared/types.ts`.
7. **No `console.log`.** Errors reach the user as one plain sentence.
8. **No secrets** in code, tests, fixtures or commit history.

Changes to `src/shared/types.ts` or the `Provider` interface are contract changes. Open an issue first. A new tool that changes user data, sends messages or spends money needs the owner's approval.

## Adding a tool

1. Define it in `src/main/agent/tools/` with `defineTool`: a name, a Zod schema and a `run` that does one fixed action.
2. If it moves, sends or writes, call `ctx.confirm()` before acting.
3. Give it to exactly one specialist in `team.ts` (and to `TOOLS` in `tools/index.ts` for single mode).
4. Add a test with the fake platform, including the declined path.
5. If you changed tool names or descriptions, update `training/build_dataset.py`.

## Pull requests

- Branch from `main`. Never push to `main` directly.
- Keep one idea per PR.
- The PR body says what changed, how you tested it, and what a person must check by hand on Windows.
- Match the existing style. Prettier formats the code (`npm run format`).

## Reporting security issues

Do not use public issues. See [SECURITY.md](SECURITY.md).
