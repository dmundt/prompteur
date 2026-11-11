# Changelog

## 1.0.0

- Promote the 0.5.0 beta to the first stable release; prompt format remains version 1.

## 0.5.0

- Refine the Activity Bar tent icon with thinner, square-ended 45-degree geometry.
- Link tooltip tags/categories to exact filters and Markdown files.
- Adopt `.prompt.md` with YAML frontmatter; ignore YAML prompts; remove category migration.
- Add built-in and profile-approved categories.
- Standardize starter names and filenames on action-first task labels.
- Add safe removal for unused profile-approved categories.
- Add Default Scope, Preferred Category, Show Tags, and Settings gear.
- Add configurable category counts: filtered matches, total prompts, or hidden.
- Sync User prompts through VS Code Settings Sync by default; add flat-list view setting.
- Add window-local prompt copy/paste, separate from generated-text Copy.
- Rewrite README introduction; rename Personal to User and use `person` icon.

## 0.4.4

- Condense repeated blank lines in copied/previewed output. Isolate unreadable prompts; index category search; update dev tooling; test Trust across hosts.

## 0.4.3

- Replace filled Activity Bar icon with thin circus-tent outline.

## 0.4.2

- Remove Insert Prompt/shortcut; make Copy Prompt the primary inline action. Generated text no longer replaces source code.

## 0.4.1

- Allow empty selections without warnings for copy/insertion/preview; retain other missing-context warnings.

## 0.4.0

- Expand starters from 6 to 16; add explain, plan, implement, test, refactor, document, and three audits. Preserve installed files.
- Strengthen refactor equivalence, requirement evidence, per-concept complexity decisions, and measurable architecture checks.
- Remove import/export; use filesystem copies.
- Keep one category tree with Personal/Workspace, tags, search, CRUD, copy, and insertion.
- Remove folder APIs, ordering, sorting, Favorites, MRU, and usage counts.
- Fix `prompts/` roots and case-insensitive search; stop reading/writing library settings.
- Replace live previews with plaintext snapshots; preserve user formatting on save.
- Install starters directly; omit bundles. Preserve settings, rules, and usage state. Move non-default libraries manually.

## 0.3.0

- Remove Agent Rules, composition, rule UI/actions, and rule starter.
- Group prompts/favorites in virtual categories; keep file paths; show tags; add exact `tag:value` filters.
- Reduce header actions; move secondary actions to item menus/Command Palette.
- Ignore rule files; preserve user libraries.

## 0.2.0

- Replace rich unpublished format with six prompt fields; rules add `enabled`.
- Use path identity, readable filenames, free tags/categories, filesystem mtimes.
- Store Favorites/MRU by path; relocate on managed moves.
- Remove UUIDs, built-in markers, timestamps, taxonomy, compatibility/migration code.
- Breaking pre-release: reject old rich files; recreate manually. Never rewrite libraries automatically.

## 0.1.1

- Address F01–F10: plaintext previews; consistent Workspace Trust.
- Serialize mutations/imports with cache publication; validate bundle ancestry; add rollback.
- Upgrade Zod 4; bound YAML, library, transfer, diagnostics, and output.
- Reject redirected ancestors; recover optional usage metadata without hiding content or masking success.
- Preserve ordering across moves/deletes/folder transfers; discriminate bundles/import kinds.
- Share folder-aware indexes; batch watcher updates; test 50,000 entries and security/integrity.

## 0.1.0

- Add classified prompt/rule starters, stable IDs, reserved extension fields.
- Index taxonomy and technology-neutral applicability.
- Store Favorites, last-use times, and usage counts locally.
- Initial release: local YAML prompt/rule manager with native editors, diagnostics, highlighting, tree, search, favorites, previews.
- Add deterministic rule composition, safe I/O, watched caches, YAML bundles.
- Add strict TypeScript, coverage gates, VS Code host smoke, local VSIX packaging.
- Replace extension/Activity Bar branding with circus tent designs.
