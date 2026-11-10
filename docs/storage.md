# Storage Contract

YAML files are the only persisted product content. No database, settings, ordering sidecar, usage store, or generated on-disk index is required.

## Layout and Model

The workspace root is `.vscode/prompts/` in the first local workspace folder. The personal root is `prompts/` inside extension profile storage. Each root has a fixed `prompts/` subtree containing recursively discovered `.yaml`/`.yml` files.

Prompt keys are exactly `version`, `name`, `description`, `category`, `tags`, and `content`. Version 1, nonempty name, and string content are required. Optional defaults are empty description/tags and category `misc`; sparse manually authored files are valid. Categories and tags are ordinary strings. Identity is scope plus relative path; equal display names are allowed.

`npm run schemas` produces the companion prompt JSON Schema from runtime Zod definitions. Alias rejection, path confinement, and resource limits remain runtime checks. Version is a format marker, not revision history.

Existing settings, rule files, and usage state are ignored and left untouched. Custom directories configured in older releases are no longer loaded; users must move those prompts into the fixed subtree manually. No migration or destructive cleanup runs.

## Reads and Edits

Loading never rewrites files. Invalid documents remain repairable tree items. Ordinary VS Code saves are not formatted or stamped with metadata. Extension-created/duplicated files use YAML serialization; retained scalar/node comments are preserved where possible.

Generation can use valid dirty editor buffers. Deletion requires saved/discarded edits and explicit confirmation.

## Safe Writes

Writes compare the expected source revision under an exclusive lock, sync a temporary file, and atomically replace an existing destination. New files are linked into place without overwriting existing paths. Temporary files/locks are cleaned on normal failure. Stale crash locks require manual removal only after confirming no writer is active.

Library mutations and watcher refreshes serialize with cache publication. Subscriber failures are reported without changing committed mutation results. External editors do not participate in locks; source checks are not a portable atomic compare-and-swap against arbitrary external writers.

Unsafe relative paths, traversal, Windows device names, symlinks/junctions, and redirected library ancestors are rejected. Scans skip directory symlinks. These checks are not a sandbox against same-privilege concurrent filesystem changes.

Budgets remain 1 MiB per file, 128 MiB of cached library source, 50,000 files/directories, and 32 MiB generated output. YAML node/depth and diagnostic sizes are bounded.

## Starters and File Copies

No import/export commands or bundle formats remain. Users can copy ordinary YAML files directly between library directories.

Starters are ordinary editable copies. Installation skips all existing destination files, including invalid ones. Each addition is atomic; the entire installation is not. Failures report partial progress.
