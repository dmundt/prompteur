# Changelog

## Unreleased

## 0.4.4

- Condense repeated blank lines in copied and previewed output; isolate unreadable prompts, index category searches, update vulnerable development tooling, and test trust behavior across supported hosts.

## 0.4.3

- Use a thin, Codicon-like circus tent outline for the Activity Bar instead of a filled silhouette.

## 0.4.2

- Remove Insert Prompt and its keyboard shortcut; promote Copy Prompt to the primary inline action. Generated prompts no longer replace selected source code.

## 0.4.1

- Allow empty selections without a generation warning for copy, insertion, and preview; other missing-context warnings remain.

## 0.4.0

- Expand the optional starter library from six to sixteen prompts, adding explanation, planning, scoped implementation, testing, refactoring, documentation, and three focused audits. Strengthen evidence, context handling, and verification guidance. Existing installed files remain untouched.
- Refine refactor equivalence checks, requirement-level test evidence, per-concept complexity decisions, and measurable architecture validation following controlled starter evaluation.
- Remove all import/export commands and handlers; use ordinary filesystem copies for prompt files.
- Keep one category-grouped prompt view, Personal/Workspace libraries, tags, search, CRUD, copy, and editor insertion.
- Remove orphaned folder-management APIs, custom ordering, sorting controls, Favorites, MRU, and usage counting.
- Use fixed `prompts/` directories and case-insensitive search; stop loading or writing library settings.
- Replace live previews with on-demand plaintext snapshots and stop formatting user files on save.
- Copy starters directly without collection bundles. Keep existing settings, rule files, and saved usage state untouched; non-default prompt locations must be moved manually into `prompts/`.

## 0.3.0

- Remove Agent Rules, rule composition, rule views/actions, and the bundled rule starter.
- Group prompts and favorites in virtual categories without moving files; show tags and support exact `tag:value` filters.
- Reduce view-header actions and move secondary prompt operations into item menus or the Command Palette.
- Ignore existing rule files without deleting or rewriting user libraries.

## 0.2.0

- Replace rich unpublished prompt format with six fields: version, name, description, category, tags, content. Rules add enabled.
- Use file paths as identity, readable filenames, ordinary tags/free categories, and filesystem modified times.
- Keep favorites/MRU in path-keyed local state and relocate it during managed file/folder moves.
- Simplify starters and duplication; remove UUIDs, built-in markers, timestamps, taxonomy fields, and compatibility/migration machinery.
- Breaking pre-release change: old rich files are rejected and must be recreated manually; user libraries are not auto-rewritten.

## 0.1.1

- Address audit findings F01-F10 with plain-text previews and consistent workspace trust boundaries.
- Serialize mutations/imports with cache publication, complete bundle ancestry validation, and safe rollback.
- Upgrade to patched Zod 4; bound YAML, library, transfer, diagnostics, and generated-output resources.
- Reject redirected filesystem ancestors; recover optional usage metadata without hiding content or failing successful actions.
- Preserve ordering across moves, deletes, and folder transfers; use explicit bundle discrimination and import kind selection.
- Share folder-aware indexes and publish watcher batches once; add 50,000-entry and security/integrity regression tests.

## 0.1.0

- Add fully classified starter prompts/rules with stable built-in identities and reserved extension fields.
- Index taxonomy metadata and technology-neutral applicability for discovery.
- Keep favorites, last-use timestamps, and aggregate usage counts in a dedicated local metadata store.

- Initial independently authored local YAML prompt and rule manager.
- Native editors, diagnostics, variable highlighting, trees, search, favorites, and previews.
- Deterministic rule composition, safe file operations, watched caches, and lossless YAML bundles.
- Strict TypeScript, full-source coverage gates, real VS Code host smoke test, and local VSIX packaging.
- Replace extension branding and Activity Bar document icon with circus tent designs.
