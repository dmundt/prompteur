# Release Scope

## Included

- Ordinary YAML prompts with six fields: version, name, description, category, tags, content.
- User and first-local-workspace libraries at fixed paths.
- One native tree grouped by category; recursive file discovery, not a second folder browser.
- Case-insensitive full-text and exact-tag search, alphabetical ordering.
- Create, edit, duplicate, confirmed delete, and clipboard generation without editing source code.
- Copy prompt records within a VS Code window across categories and User/Workspace libraries.
- Four fixed variables: selection, clipboard, filename, workspace.
- On-demand plaintext snapshot preview.
- Sixteen optional starter files covering understanding, planning, implementation, reviews, tests, debugging, refactoring, documentation, and audits.
- Basic diagnostics, variable highlighting, debounced file watching, bounded input, and safe/conflict-aware writes.
- Workspace Trust checks, explicit errors, unit/integration tests, and a real VS Code host smoke test.

## Excluded

Custom ordering, sorting controls, Favorites, MRU, usage counters/persistence, configurable library settings, all import/export commands, collection bundles, live previews, automatic formatting, and folder-management commands.

No UUID prompt identities, rules, inheritance, databases, synchronization, cloud storage, accounts, roles, plugin systems, AI providers, analytics, custom editors, graph views, or speculative metadata.

## Acceptance Workflows

1. Create a prompt in a category; edit/save it without forced formatting.
2. Find it by full text or exact tags and copy generated content for pasting into Chat or another application.
3. Preview a snapshot without fetching external resources.
4. Copy ordinary YAML files into a library and discover them without rewriting their source.
5. Confirm deletion and reject stale/dirty changes.
6. Discover nested files, recover malformed YAML, and observe external edits.
7. Enforce Workspace Trust and filesystem/resource boundaries.

Existing settings, rule files, and saved usage state are not deleted or migrated. Custom-directory users must move prompts manually under the fixed `prompts/` directory. Future scope requires user evidence rather than prebuilt extension points.
