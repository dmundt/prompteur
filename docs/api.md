# Internal API and Commands

- No public integration/provider API.
- Async command failures show native errors and reject; cancellations do not mutate.

- `LibraryService` filesystem port: `list`, `read`, expected-source `write`/`remove`.
- Operations: lazy `get`, incremental/full `refresh`, case-insensitive `search`, validated `save`/`writeSource`, `delete`, subscriptions.
- Snapshots contain entries/problems; treat as immutable.

- Built-ins: `explain`, `plan`, `implement`, `review`, `test`, `debug`, `document`.
- Users may approve profile-wide categories; runtime validates them. Remove a custom category only when no valid prompt uses it.
- JSON Schema covers frontmatter. Prompt body is raw Markdown after closing `---`.

- `prompteur.defaultScope`: applies to untargeted New Prompt, Add Starter Library, and Paste Prompt. Explicit tree targets win. `ask` shows the picker when both libraries exist; otherwise it selects User. Missing configured Workspace library errors; never redirect to User.
- `prompteur.preferredCategory`: preselects an approved category; user confirmation remains required.
- `prompteur.showTags`: toggles row tag labels; defaults `true`. Search and tooltip links remain unchanged.
- `prompteur.categoryCountMode`: `filtered` (default), `total`, or `hidden`. Search still determines which categories appear; counts use filtered matches or all valid prompts in each visible category.

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
- Prompt-record copy/paste is window-local, source-preserving, and separate from OS clipboard.
- Category paste overrides category; scope/palette paste preserves it.
- No AI calls or direct Chat insertion.
