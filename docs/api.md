# Internal API and Commands

No public integration/provider API is exported. Asynchronous command failures display a native error and reject; cancellations return without mutation.

`LibraryService` accepts a filesystem port with `list`, `read`, expected-source `write`, and expected-source `remove`. It provides lazy `get`, incremental/full `refresh`, case-insensitive `search`, validated `save`/`writeSource`, `delete`, and subscriptions. Snapshots contain entries and validation problems; consumers treat them as immutable.

`SearchIndex` reuses normalized text for unchanged entries and applies full-text/exact-tag filters with alphabetical results. `generate(content, context)` returns `{ text, missing }` for the four supported variables and condenses repeated blank lines in generated output.

| Command                 | Action                                     |
| ----------------------- | ------------------------------------------ |
| `prompteur.newPrompt`   | Create and open prompt YAML                |
| `prompteur.addStarters` | Copy missing starter prompts               |
| `prompteur.edit`        | Open source or damaged YAML                |
| `prompteur.delete`      | Confirm and delete a saved prompt          |
| `prompteur.duplicate`   | Copy to a readable collision-safe filename |
| `prompteur.copy`        | Generate and copy to clipboard             |
| `prompteur.copyPrompt`  | Copy prompt data to a window-local buffer  |
| `prompteur.pastePrompt` | Create prompt copy in a library/category   |
| `prompteur.preview`     | Open an independent plaintext snapshot     |
| `prompteur.search`      | Open live main-tree filter                 |
| `prompteur.clearSearch` | Reset filter                               |
| `prompteur.refresh`     | Reload available libraries                 |

Tree arguments are private. Palette invocations select scope/prompt when needed. Prompt-record copy/paste is window-local, leaves the source intact, and does not use the OS clipboard. Pasting on a category overrides the copied category; scope and palette paste preserve it. Commands do not invoke AI tools or insert directly into Chat.
