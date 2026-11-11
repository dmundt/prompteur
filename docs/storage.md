# Storage Contract

Markdown files with YAML frontmatter are the only persisted prompt content. A small profile-wide approved-category list is stored in VS Code extension state; no database, ordering sidecar, usage store, or generated on-disk index is used.

## Layout and Model

The workspace root is `.vscode/prompts/` in the first local workspace folder. The User library root is `prompts/` inside the current VS Code profile's extension storage. Each root has a fixed `prompts/` subtree containing recursively discovered `.prompt.md` files.

Frontmatter keys are exactly `version`, `name`, `description`, `category`, and `tags`. The Markdown body supplies `PromptData.content`. Version 1, nonempty name, and an approved category are required. Description and tags default to empty values. The built-in categories are `explain`, `plan`, `implement`, `review`, `test`, `debug`, and `document`; users may add profile-wide categories after confirmation. Category values are case-normalized when decoded and limited to 64 characters. Tags remain ordinary strings. Identity is scope plus relative path; equal display names are allowed.

`npm run schemas` produces the companion metadata JSON Schema from runtime Zod definitions. YAML frontmatter is bounded and validated; the Markdown body is retained as raw text. Alias rejection, path confinement, and resource limits remain runtime checks. Version is a format marker, not revision history.

Existing settings, rule files, and usage state are ignored and left untouched. Custom directories configured in older releases are no longer loaded; users must move Markdown prompts into the fixed subtree manually. Existing YAML prompt files remain untouched and are not discovered or converted. Prompts with unapproved categories are shown as repairable problems; users may add a profile-wide category from the category picker after confirmation.

## Reads and Edits

Loading never rewrites files. Invalid frontmatter remains a repairable tree item. Ordinary VS Code saves are not formatted or stamped with metadata. Extension-created/duplicated files serialize frontmatter while preserving the Markdown body exactly; frontmatter comments are retained where possible.

Generation can use valid dirty editor buffers. Deletion requires saved/discarded edits and explicit confirmation.

## Safe Writes

Writes compare the expected source revision under an exclusive lock, sync a temporary file, and atomically replace an existing destination. New files are linked into place without overwriting existing paths. Temporary files/locks are cleaned on normal failure. Stale crash locks require manual removal only after confirming no writer is active.

Library mutations and watcher refreshes serialize with cache publication. Subscriber failures are reported without changing committed mutation results. External editors do not participate in locks; source checks are not a portable atomic compare-and-swap against arbitrary external writers.

Unsafe relative paths, traversal, Windows device names, symlinks/junctions, and redirected library ancestors are rejected. Scans skip directory symlinks. These checks are not a sandbox against same-privilege concurrent filesystem changes.

Budgets remain 1 MiB per file, 128 MiB of cached library source, 50,000 files/directories, and 32 MiB generated output. Frontmatter YAML node/depth and diagnostic sizes are bounded.

## Starters and File Copies

There are no file import/export commands or bundle formats. **Copy Prompt/Paste Prompt** keep a prompt record in a window-local memory buffer and create a new `.prompt.md` file on paste; the source remains unchanged. Pasting on a category changes the copy's category. For file transfer between VS Code windows or outside VS Code, copy prompt Markdown files directly between library directories.

Starters are ordinary editable copies. Installation skips all existing destination files, including invalid ones. Each addition is atomic; the entire installation is not. Failures report partial progress.
