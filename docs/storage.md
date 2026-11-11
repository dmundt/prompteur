# Storage Contract

- Prompts: Markdown with YAML frontmatter. Persist approved categories in profile state.
- Store `defaultScope`, `preferredCategory`, `showTags`, `groupByCategory`, and `syncUserPrompts` in native VS Code configuration; no library-settings file.
- No database, ordering sidecar, usage store, or generated disk index.

## Layout and Model

- Workspace root: `.vscode/prompts/` in first local workspace.
- User root: `prompts/` in current profile's extension storage.
- Discover nested `.prompt.md` files under each root's `prompts/` subtree.
- With `syncUserPrompts` enabled, sync the User library snapshot and approved categories through `globalState.setKeysForSync`; VS Code Settings Sync moves them between instances. Local Markdown files remain canonical; no `User/prompts` mirroring or direct network calls. Workspace prompts never sync through this feature.
- Reconcile incoming snapshots on activation and **Reload Libraries**. Unique offline additions merge; local content wins same-path conflicts. Tombstones propagate deletions.

- Frontmatter keys: `version`, `name`, `description`, `category`, `tags`. Markdown body is `PromptData.content`.
- Required: version 1, nonempty name, approved category. Description/tags default empty.
- Built-ins: `explain`, `plan`, `implement`, `review`, `test`, `debug`, `document`. Confirm profile-wide additions.
- Normalize categories to lowercase; limit to 64 characters. Tags are strings.
- Identity is scope + relative path; display names may repeat.

- `npm run schemas` generates metadata JSON Schema from Zod.
- Bound/validate frontmatter; retain body as raw text. Runtime enforces alias, path, and resource limits.
- Version marks format; it is not revision history.

- Preserve existing settings, rules, and usage state.
- Do not load old custom directories or YAML prompts; leave YAML files untouched. Move Markdown prompts into fixed `prompts/` manually.
- Show unapproved categories as repairable problems. Add profile categories only after confirmation.
- Remove profile categories only when no valid prompt uses them; reassign prompts first.

## Reads and Edits

- Loading never rewrites. Invalid frontmatter is repairable.
- Ordinary saves preserve formatting and add no metadata.
- Extension writes serialize frontmatter and preserve body exactly; retain comments where possible.

- Generation can use valid dirty buffers. Delete only after saving/discarding edits and confirming.

## Safe Writes

- Compare expected source under exclusive lock.
- Sync temporary file; atomically replace existing destination. Create new files without overwrite.
- Clean temporary files/locks after normal failure. Remove stale crash locks only after confirming no writer is active.

- Serialize library mutations/watchers with cache publication. Report subscriber failures without changing committed results.
- External editors ignore locks; source checks are not portable atomic compare-and-swap.

- Reject unsafe paths, traversal, Windows device names, symlinks/junctions, redirected ancestors.
- Skip directory symlinks. Not a sandbox against same-privilege concurrent filesystem changes.

- Limits: 1 MiB/file; 128 MiB cached source; 50,000 files/directories; 32 MiB generated output.
- Bound frontmatter YAML nodes/depth and diagnostics.

## Starters and File Copies

- No import/export commands or bundles.
- **Copy Prompt/Paste Prompt** use a window-local buffer, create a new `.prompt.md`, and preserve source. Category targets override category.
- Transfer between windows/apps by copying Markdown files.

- Starters are editable copies. Skip every occupied destination, including invalid files.
- Each add is atomic; installation is not. Report partial progress.
