# Internal API and Commands

- No public prompt-library API or direct model requests. The read-only `prompteur_findPrompt` VS Code Language Model Tool searches and renders prompts for Copilot Chat/Agents.
- Async command failures show native errors and reject; cancellations do not mutate.

- `LibraryService` filesystem port: `list`, `read`, expected-source `write`/`remove`.
- Operations: lazy `get`, incremental/full `refresh`, case-insensitive `search`, validated `save`/`writeSource`, `delete`, subscriptions.
- Snapshots contain entries/problems; treat as immutable.

- Built-ins: `explain`, `plan`, `implement`, `review`, `test`, `debug`, `document`.
- Users may approve profile-wide categories; runtime validates them. Remove a custom category only when no valid prompt uses it.
- JSON Schema covers frontmatter. Prompt body is raw Markdown after closing `---`.

- `prompteur.defaultScope`: applies to untargeted New, Add Starter Library, and Paste Prompt. Explicit tree targets win. `ask` shows the picker when both libraries exist; otherwise it selects User. Missing configured Workspace library errors; never redirect to User.
- `prompteur.preferredCategory`: preselects an approved category; user confirmation remains required.
- `prompteur.showTags`: toggles row tag labels; defaults `true`. Search and tooltip links remain unchanged.
- `prompteur.categoryCountMode`: `filtered` (default), `total`, or `hidden`. Search still determines which categories appear; counts use filtered matches or all valid prompts in each visible category.
- `prompteur.groupByCategory`: `true` (default) groups rows; `false` shows a flat prompt list.
- `prompteur.syncUserPrompts`: `true` (default) opts the User library snapshot into VS Code Settings Sync. Incoming changes reconcile on activation or **Reload Libraries**; Workspace prompts are excluded.

- `SearchIndex` reuses normalized unchanged text; filters full text/tags/categories; sorts alphabetically.
- Filters use AND. Quote values with spaces: `tag:"security review"`, `category:"review"`.
- Tooltip links filter tags/categories or open the current Markdown path; commands re-resolve paths.
- `generate(content, context)` returns `{ text, missing }` for four variables and condenses repeated blank lines.

| Command                    | Action                                     |
| -------------------------- | ------------------------------------------ |
| `prompteur.newPrompt`      | Create and open prompt Markdown            |
| `prompteur.addStarters`    | Copy missing starter prompts               |
| `prompteur.removeCategory` | Remove an unused profile-approved category |
| `prompteur.edit`           | Open source or damaged Markdown prompt     |
| `prompteur.delete`         | Confirm and delete a saved prompt          |
| `prompteur.duplicate`      | Copy to a readable collision-safe filename |
| `prompteur.copy`           | Generate and copy to clipboard             |
| `prompteur.copyPrompt`     | Copy prompt data to a window-local buffer  |
| `prompteur.pastePrompt`    | Create prompt copy in a library/category   |
| `prompteur.preview`        | Open an independent plaintext snapshot     |
| `prompteur.search`         | Open live main-tree filter                 |
| `prompteur.clearSearch`    | Reset filter                               |
| `prompteur.refresh`        | Reload available libraries                 |
| `prompteur.openSettings`   | Open Prompteur settings                    |

- Tree arguments are private. Palette invocations select scope/prompt as needed.
- Prompt-record copy/paste is window-local, source-preserving, and separate from OS clipboard. Paste is enabled when the window-local buffer contains a copied prompt.
- Category paste overrides category; scope/palette paste preserves it.
- **Copy Text** (`prompteur.copy`) renders to the clipboard and shows paste guidance. It is the sole inline prompt action; a separate context-menu group places a separator after it.
- Missing filename/workspace values do not block Copy Text; one completion notification lists missing context. Empty clipboard input requires confirmation. Empty selection is allowed; Preview retains missing-context details.
- `prompteur.duplicate` remains callable for compatibility but is hidden from menus and the Command Palette. Use **Copy Text** for text handoff and **Copy Prompt** / **Paste Prompt** for library copies.
- VS Code has no supported API to insert into the active Chat composer; users paste the clipboard result.
- `prompteur_findPrompt` is read-only. Search with `{ query, scope? }` or select a returned candidate with `{ scope, path }`; do not combine query and path. Query length: 1–256 characters; blank queries/paths, invalid scopes, and incomplete/mixed modes error.
- Query mode searches User and trusted Workspace libraries by default. Trimmed, case-insensitive exact names take priority; otherwise use existing full-text/filter search. Repeated exact names remain ambiguous.
- Direct mode matches the exact library-relative path in validated library entries; no arbitrary filesystem reads, path normalization, or fallback search. Workspace search and direct lookup require Trust.
- Results: `match` includes prompt identity (`name`, `category`, `scope`, `path`), rendered `content`, and `missing` variables; `ambiguous` includes up to 10 candidate metadata records and `truncated`, without content; `not_found` identifies the query or requested scope/path. All results include `workspaceOmittedForTrust`.
- Prompt-row hover explains Copy Text and Copy Prompt; contributed command tooltips use native titles, not an unsupported manifest tooltip field.
- VS Code confirms tool use before prompt data is returned to Copilot. The rendered prompt and any requested context variables become model context; direct model requests and prompt mutations are not performed.
