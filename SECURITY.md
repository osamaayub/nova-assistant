# Security policy

## Reporting a problem

Please do not open a public issue for a security problem. Use GitHub's private reporting: **Security → Report a vulnerability** on [the repository](https://github.com/osamaayub/nova-assistant/security). Include the steps to reproduce and the Nova version (the release you downloaded, or `package.json`).

You can expect a first reply within a week. Fixes ship in the next patch release.

## Supported versions

Only the latest release gets fixes.

## What Nova promises

These are design rules, and a break of any of them is a security bug:

| Rule | Detail |
| --- | --- |
| The model never gets a shell | Tools run fixed actions with Zod-validated values. The model picks a tool name and values, never a command. |
| No tool deletes your files | Nothing removes files or folders. The only deletion is `forget_fact`, which removes remembered facts when you ask. `write_code_file` can replace a file, but only after you approve the exact path. |
| Ask before changing | Anything that moves, writes or sends needs an explicit Allow click (`ctx.confirm()`). |
| Files stay in the user's folders | Paths are confined to the folders the user allows. |
| Web reads are public only | `read_web_page` refuses private and local addresses and caps download size. |
| The window is locked down | Strict Content Security Policy on desktop (checked in CI by `scripts/check-csp.mjs`). The window only calls functions exposed in `src/preload`. |
| Keys are encrypted | The Claude API key is stored with Electron `safeStorage`, never in code, tests or logs. |

## Known limits

- The Windows installer is not code-signed yet, so SmartScreen warns on first run.
- Local model output is untrusted. A small model can pick the wrong tool, which is why the Allow step exists.
- The optional phone link serves over your local network or a tunnel you start. Treat its link like a password.

## Dependencies

`npm audit` runs weekly on production dependencies (`.github/workflows/security-audit.yml`), and Dependabot opens grouped update PRs.
