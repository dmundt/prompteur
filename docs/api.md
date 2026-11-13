# Internal API and Commands

- No public prompt-library API or direct model requests. The read-only `prompteur_findPrompt` VS Code Language Model Tool searches and renders prompts for Copilot Chat/Agents.
- Async command failures show native errors and reject; cancellations do not mutate.

- `LibraryService` filesystem port: `list`, `read`, expected-source `write`/`remove`.
- Operations: lazy `get`, incremental/full `refresh`, configurable `search`, internal cross-scope `searchRanked`, validated `save`/`writeSource`, `delete`, subscriptions.
- Snapshots contain entries/problems; treat as immutable.
- The **Prompteur** view has an initially expanded **Prompts** root above User and available Workspace scopes. Scope labels show filtered valid entry counts in parentheses; the root label shows their sum. Counts load eagerly without blocking activation and update on filter, search-setting, and library changes. Zero matches display `(0)`; validation problems are excluded. `categoryCountMode` still controls category rows only. No `TreeView.badge` is assigned. Incomplete library loads do not publish partial totals; errors use native notifications.

- Built-ins: `explain`, `plan`, `implement`, `review`, `test`, `debug`, `document`.
- Users may approve profile-wide categories; runtime validates them. Remove a custom category only when no valid prompt uses it.
- **Add Prompt Category** creates approved categories independently of prompt creation. **Approve Prompt Category** on an unapproved-category problem row rechecks the saved file, asks for optional help, and requires profile approval. It never rewrites prompt content or silently approves YAML values.
- Custom category creation asks for an optional single-line description, trimmed to at most 240 characters. **Edit Category Description** targets a custom category row or offers a native picker of approved custom categories, including unused ones. Blank clears help; Escape cancels without changes. Built-in descriptions are read-only. Description edits update both scopes' hover without modifying prompt files or requiring Workspace Trust.
- Custom category rows display a muted `custom` description. **Rename Category...** accepts a distinct, unapproved name (normalized lowercase, maximum 64 characters), confirms affected saved prompts across both libraries, and preserves category help, filenames, comments, and body text. Built-ins cannot be renamed. Unsaved affected editors, invalid library prompts, or untrusted workspace writes block rename. Preferred Category settings and active filters remain unchanged.
- Rename uses expected-source writes. On failure it attempts source-checked rollback; newer file content is never overwritten. Incomplete recovery reports affected paths and retains both approved categories for repair.
- JSON Schema covers frontmatter. Prompt body is raw Markdown after closing `---`.

- `prompteur.defaultScope`: applies to untargeted New, Add Starter Library, and Paste Prompt. Explicit tree targets win. `ask` shows the picker when both libraries exist; otherwise it selects User. Missing configured Workspace library errors; never redirect to User.
- `prompteur.preferredCategory`: preselects an approved category; user confirmation remains required.
- `prompteur.showTags`: toggles row tag labels; defaults `true`. Search and tooltip links remain unchanged.
- `prompteur.categoryCountMode`: `filtered` (default), `total`, or `hidden`. Search still determines which categories appear; counts use filtered matches or all valid prompts in each visible category.
- `prompteur.groupByCategory`: `true` (default) groups rows; `false` shows a flat prompt list.
- `prompteur.syncUserPrompts`: `true` (default) opts the User library snapshot into VS Code Settings Sync. Local prompts and counts load immediately without waiting for startup reconciliation. Successful background reconciliation refreshes the User library and counts; failures use native errors and leave local prompts available. **Reload Libraries** waits for reconciliation before refreshing libraries. Workspace prompts are excluded from sync.

- `prompteur.search.matching`: `exact`, `fullText` (default), or `fuzzy`. Each phase runs over all eligible entries: whole-name exact first; full-text AND next unless exact-only; fuzzy whole-name fallback last when enabled. Apply category/tag constraints before phase selection.
- `prompteur.search.caseSensitive`: `false` (default); affects names/free text only. Exact tag/category filters remain case-insensitive.
- `prompteur.search.ranking`: `relevance` (default) or `name`. Relevance tiers: exact name, name prefix, name substring, description/category/tags/path, body. Multiword full-text relevance uses the weakest matched term. Fuzzy relevance uses smaller edit distance.
- `prompteur.search.selection`: `bestMatch` (default) or `requireChoice`; Copilot-only selection policy. Best Match renders a unique highest-relevance result; Require Choice requires a unique candidate. Duplicate exact names and highest-relevance ties remain ambiguous. Name/scope/path ordering never breaks selection ties.
- All four settings use native window scope. Matching/case/ranking changes refresh tree filtering; subsequent tool calls use current settings. Invalid values error explicitly. Tree always retains all matches in its chosen phase.
- `SearchIndex` caches raw/normalized unchanged fields and parsed category/tag identities. Empty/filter-only queries return all eligible entries alphabetically. Names and queries trim outer whitespace, preserving internal free-text whitespace; filter tokens are removed from name comparison.
- Fuzzy name distance is bounded Levenshtein: insert/delete/replace cost 1, transposition costs 2. Disabled below 4 free-text characters; limit 1 for 4–7, 2 for 8+. Length pruning, banded rows, and early exit bound work; no fuzzy body matching.
- `searchRanked` combines all eligible scopes before matching-phase selection, ranking, and candidate truncation. Relevance ties use name/scope/path only for stable presentation.
- Filters use AND. Quote values with spaces: `tag:"security review"`, `category:"review"`.
- Tooltip links filter tags/categories or open the current Markdown path; commands re-resolve paths.
- `generate(content, context)` returns `{ text, missing }` for `selection`, `clipboard`, `filename`, `workspace`, and `text`; condenses repeated blank lines.

| Command                             | Action                                          |
| ----------------------------------- | ----------------------------------------------- |
| `prompteur.newPrompt`               | Create and open prompt Markdown                 |
| `prompteur.addStarters`             | Copy missing starter prompts                    |
| `prompteur.removeCategory`          | Remove an unused profile-approved category      |
| `prompteur.addCategory`             | Approve a profile category without a new prompt |
| `prompteur.approveCategory`         | Approve a saved prompt's unapproved category    |
| `prompteur.renameCategory`          | Rename custom category and affected prompts     |
| `prompteur.editCategoryDescription` | Edit optional custom category hover help        |
| `prompteur.edit`                    | Open source or damaged Markdown prompt          |
| `prompteur.delete`                  | Confirm and delete a saved prompt               |
| `prompteur.duplicate`               | Copy to a readable collision-safe filename      |
| `prompteur.copy`                    | Generate and copy to clipboard                  |
| `prompteur.copyPrompt`              | Copy prompt data to a window-local buffer       |
| `prompteur.pastePrompt`             | Create prompt copy in a library/category        |
| `prompteur.preview`                 | Open an independent plaintext snapshot          |
| `prompteur.search`                  | Open live main-tree filter                      |
| `prompteur.clearSearch`             | Reset filter                                    |
| `prompteur.refresh`                 | Reload available libraries                      |
| `prompteur.openSettings`            | Open Prompteur settings                         |
| `prompteur.openUserLibrary`         | Reveal User library root in system file manager |

- Tree arguments are private. Palette invocations select scope/prompt as needed.
- Prompt-record copy/paste is window-local, source-preserving, and separate from OS clipboard. Paste is enabled when the window-local buffer contains a copied prompt.
- Category paste overrides category; scope/palette paste preserves it.
- **Copy Text** (`prompteur.copy`) renders to the clipboard and shows paste guidance. It is the sole inline prompt action; a separate context-menu group places a separator after it.
- Missing filename/workspace values do not block Copy Text; one completion notification lists missing context. Empty clipboard input requires confirmation. Empty selection is allowed; Preview retains missing-context details.
- `prompteur.duplicate` remains callable for compatibility but is hidden from menus and the Command Palette. Use **Copy Text** for text handoff and **Copy Prompt** / **Paste Prompt** for library copies.
- VS Code has no supported API to insert into the active Chat composer; users paste the clipboard result.
- `prompteur_findPrompt` is read-only. Search with `{ query, scope? }` or select a returned candidate with `{ scope, path }`; do not combine query and path. Query length: 1–256 characters; blank queries/paths, invalid scopes, and incomplete/mixed modes error.
- Query mode searches User and trusted Workspace libraries by default using shared configured matching. After invocation approval, Best Match can return prompt/context without a separate choice among lower-ranked candidates. Require Choice retains conservative multiple-match handling.
- Direct mode matches the exact library-relative path in validated library entries; no arbitrary filesystem reads, path normalization, or fallback search. Workspace search and direct lookup require Trust.
- Results: `match` includes prompt identity (`name`, `category`, `scope`, `path`), rendered `content`, and `missing` variables; `ambiguous` includes up to 10 candidate metadata records and `truncated`, without content; `not_found` identifies the query or requested scope/path. All results include `workspaceOmittedForTrust`.
- Prompt-row hover contains description, category, tags, saved prompt context variables, and path. Invalid placeholders are reported there; context values are not read. Contributed command tooltips use native titles.
- Category hover describes built-in purposes or identifies a custom category. Scope hover summarizes storage, optional User sync, and Workspace Trust; its folder path links to the system file manager. Links resolve only the current library root, require no Trust, and report missing folders without creating them.
- The prompt view toolbar switches from search to filter icon for a non-whitespace query; either opens the current live filter. **Clear Filter** resets it.
- Repeated filter commands show the existing input. Hide and shutdown dispose the input and its listeners; hide retains the query. A plain native tree message shows `Filter: <trimmed query>` without changing the matching query. Blank queries and **Clear Filter** remove the message. Filters remain window-local and are not persisted.
- When a live filter has no valid prompt matches, the tree shows a row that clears the filter when selected. Library errors remain reported errors.
- `text` uses a native single-line input box per invocation. Enter submits nonblank text; Escape, disposal, or tool cancellation aborts pending generation. Limit: 1 MiB. Concurrent requests error. Recheck Trust before output.
- No extension-owned input persistence or history.
- VS Code confirms tool use before prompt data is returned to Copilot. The rendered prompt and any requested context variables become model context; direct model requests and prompt mutations are not performed.
