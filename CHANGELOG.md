# Changelog

All notable changes to Nova. Versions follow [Semantic Versioning](https://semver.org/).

## Unreleased

### Added
- Document search (RAG): BM25 plus embeddings with rank fusion, and recall of memories by meaning.
- Fine-tuning pipeline in `training/` (experimental), now targeting Qwen3-4B-Instruct-2507 (Apache 2.0).
- Per-message memory recall instead of sending every fact.
- Memory editing, wake chime, phone alerts and an "anywhere" link.
- Vercel web preview with browser chat through local Ollama.
- Weekly `npm audit` and grouped Dependabot updates.

### Changed
- CI and release workflows reworked: parallel jobs, least-privilege release, CSP checks for desktop and web builds.
- Web preview keeps settings across reloads and honours the brain choice. Its default model is `qwen3:4b-instruct`.

### Security
- `read_web_page` hardened against SSRF, unbounded downloads and prompt injection.

## 1.2.1 - 2026-11-14

### Added
- Control-room screen, avatars, everyday-help tools, WhatsApp send and phone voice.
- Remote MCP connector through `mcp-remote`, and WhatsApp and JSON MCP connector imports.
- Behavior notes setting for prompt tuning.
- Agents show as working the moment a command starts.
- Automated release version bumps.

### Changed
- Free cloud brain uses the reliable non-streaming path.

## 1.2.0 - 2026-11-13

### Added
- Phone link, crew board, parallel agents, connector gallery and cloud brain.
- Coding crew.

## 1.1.0 - 2026-11-09

### Added
- Free local brain through Ollama, with a connection check.
- Team of agents (PC, Files, Research) and a team-aware prompt.
- `read_web_page` tool (public pages only).
- Settings for brain choice, Ollama address and model, and team mode.

## 1.0.0 - 2026-11-08

### Added
- Voice assistant with local Whisper speech to text, Windows and Kokoro voices.
- Claude tool-use agent loop, characters, orb and chat with an Allow card.
- Tools for apps, web, music, system, timers, files (ask first) and memory.
- Settings with an encrypted API key, and a strict Content Security Policy.
- Windows installer through GitHub Releases.
