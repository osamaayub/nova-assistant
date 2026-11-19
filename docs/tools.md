# Tool reference

Everything Nova can do on your PC is one of these tools. The model picks a tool name and values. Each tool has a Zod schema that checks the values, and runs one fixed action. The model never supplies a command, and folders are always one of a fixed list: `desktop`, `documents`, `downloads`, `pictures`, `music`, `videos`.

Tools that move, write, send or close something ask for an **Allow** click first. No tool deletes your files. Source: [`src/main/agent/tools/`](../src/main/agent/tools/). Which agent holds which tool is set in [`team.ts`](../src/main/agent/team.ts). A test (`test/tools-doc.test.ts`) fails if a tool is missing from this page, and `test/tool-contract.test.ts` checks the rules above.

## PC agent

| Tool | What it does | Inputs |
| --- | --- | --- |
| `open_app` | Opens a program from the known list (add more in Settings → Apps). | `app` (text, up to 60) |
| `close_app` | Closes a program from the known list, like clicking its X. Asks first, because unsaved work may be lost. | `app` (text, up to 60) |
| `open_website` | Opens a page in your default browser. | `url` (text, up to 500) |
| `play_music` | YouTube: opens the top result and it starts playing. Spotify: opens the search only. | `query` (text, up to 120), `service?` (`youtube` or `spotify`) |
| `whatsapp_message` | After you approve, opens the chat in WhatsApp Desktop with the message typed in and presses Send. If WhatsApp is not in front in time, the chat is left ready for you to press Send. | `phone` (text, up to 25, with country code), `message` (text, up to 500) |
| `system_status` | Reads CPU load, memory, disk, battery and the busiest programs. | none |
| `get_datetime` | Gets the local date, time and time zone. Also held by the Research agent. | none |
| `set_timer` | Shows a Windows notification after 1 to 720 minutes. Only fires while Nova is running. | `minutes` (number), `label` (text, up to 80) |

## Files agent

| Tool | What it does | Inputs |
| --- | --- | --- |
| `list_folder` | Lists files and folders in one of your folders. Also held by the Architect, Developer, Reviewer and Tester agents. | `folder`, `subfolder?` (text, up to 200) |
| `open_folder` | Opens one of your folders in File Explorer. | `folder`, `subfolder?` |
| `find_file` | Finds files or folders by part of the name, a few levels deep, up to 15 matches. Read-only. | `query` (text, up to 80), `folder?` (one folder or `all`) |
| `search_documents` | Searches inside your notes and documents (plain text, Markdown, CSV, code) by meaning when the local embedding model is available, otherwise by keywords. Read-only. No PDF or Word yet. | `query` (text, up to 200) |
| `create_folder` | Creates a new, empty folder. Never overwrites or changes anything that exists. | `folder`, `name` (text, up to 80), `subfolder?` |
| `organize_downloads` | Shows a plan, then moves loose files in Downloads into folders by type (Images, Documents, Archives, Installers, Videos, Music, Code, Other). Nothing is deleted or overwritten. | none |

## Coding crew (Architect, Developer, Reviewer, Tester)

| Tool | Held by | What it does | Inputs |
| --- | --- | --- | --- |
| `read_code_file` | all four | Reads a text or code file inside your folders. | `folder`, `path` (text, up to 400), `maxChars?` |
| `write_code_file` | Developer | Creates or replaces a text or code file. You approve the exact path first. | `folder`, `path`, `content` (text, up to 100,000), `overwrite?` |
| `run_project_check` | Tester | Runs one fixed check after you approve: `npm test`, `typecheck` or `lint` for Node projects, or `python -m pytest`. No other commands. | `folder`, `path?`, `check` (`test`, `typecheck` or `lint`) |

## Research agent

| Tool | What it does | Inputs |
| --- | --- | --- |
| `web_search` | Searches the web (no key) and returns title, address and a short description. | `query` (text, up to 200) |
| `read_web_page` | Downloads a public page and reads its first 6,000 characters. Refuses private and local addresses. | `url` (text, up to 500) |

## Memory (main agent)

| Tool | What it does | Inputs |
| --- | --- | --- |
| `remember_fact` | Saves a short, lasting fact about you, for example "Prefers short answers". Never passwords, card numbers or health details. | `fact` (text, up to 300) |
| `forget_fact` | Deletes remembered facts that contain the given words, when you ask. | `about` (text, up to 100) |

Facts are stored locally and can be edited in Settings.

## Connectors

MCP servers you connect in Settings add their own tools to a Connectors agent. Tools that change data ask for approval first.
