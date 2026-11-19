## What changed

<!-- One or two sentences. Link the issue or the task in docs/plan.md. -->

## How I tested it

<!-- Commands you ran and what you saw. -->

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test` (or `npm run test:coverage`)

## Done when

<!-- Copy the task's "done when" list. Check each item, or say why it is not checked. -->

## Needs a Windows check by hand

<!-- Voice, opening apps and the installer cannot run in CI. List the manual steps, or write "none". -->

## Rules (see CONTRIBUTING.md)

- [ ] No model output is run as a command, and no new tool deletes anything
- [ ] Anything that moves, writes or sends calls `ctx.confirm()` first
- [ ] No new IPC channel without a type in `src/shared/types.ts`
- [ ] No `console.log`, no keys or secrets in code, tests or fixtures
