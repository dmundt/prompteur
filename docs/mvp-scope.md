# Release Scope

## Included

- `.prompt.md`: YAML frontmatter (`version`, `name`, `description`, `category`, `tags`) + raw Markdown body. Seven built-ins; approved profile-wide additions.
- Fixed User and first-local-Workspace libraries.
- Native tree groups by category by default; `prompteur.groupByCategory` can show a flat prompt list. Recursive discovery; no folder browser.
- Case-insensitive full-text/exact-tag search; alphabetical results.
- Create, edit, duplicate, confirm-delete, copy generated text; never edit source code.
- **Copy** copies rendered text to the clipboard; Chat composer insertion is unavailable.
- Read-only Copilot prompt search/render tool; Workspace results require Trust and tool invocation is confirmed by VS Code.
- Window-local prompt copy/paste across categories and libraries.
- View settings: Default Scope (`ask`), Preferred Category (empty), Show Tags (`true`), Group by Category (`true`).
- Variables: selection, clipboard, filename, workspace.
- On-demand plaintext preview snapshot.
- 16 optional starters across seven built-in categories.
- Diagnostics, token highlighting, debounced watchers, bounded input, safe/conflict-aware writes.
- Workspace Trust, explicit errors, unit/integration tests, VS Code host smoke test.

## Excluded

- Excluded: custom ordering/sort, Favorites/MRU/usage, configurable library paths, import/export/bundles, live preview, autoformat, folder management.

- No UUIDs, rules, inheritance, databases, sync/cloud/accounts/roles, plugins, direct AI provider/model requests, analytics, custom editors, graph views, or speculative metadata.

## Acceptance Workflows

1. Create a prompt in a category; edit/save it without forced formatting.
2. Find it by full text or exact tags; use **Copy** to copy generated content for pasting, or ask Copilot Chat to find/use a saved prompt through the read-only tool.
3. Preview a snapshot without fetching external resources.
4. Copy `.prompt.md` files into a library and discover them without rewriting their source; ignore existing YAML prompt files.
5. Confirm deletion and reject stale/dirty changes.
6. Discover nested Markdown prompt files, recover malformed frontmatter, and observe external edits.
7. Enforce Workspace Trust and filesystem/resource boundaries.

- Preserve existing settings, rules, and usage state. Move prompts from custom directories to fixed `prompts/` manually.
- Add future scope only with user evidence; avoid speculative extension points.
