# Verification

```sh
npm run lint
npm run format:check
npm run coverage
npm run build
npm run test:host
npm run package
```

Coverage gates remain 91% for lines, statements, functions, and branches across `src/`, including native VS Code adapters. Tests are updated with removed features, not retained as compatibility scaffolding.

Unit/integration suites cover six-field schemas and approved categories, comments, unknown-field rejection, malformed YAML/aliases/depth, path identity, concurrent conflict-safe writes, recovery, bounded resources, symlink/junction confinement, exact tag/category and full-text search, quoted filter values, linked tooltip filtering/path opening, 10,000-entry cached search, category grouping, batches, watchers, variable substitution, CRUD, snapshot previews, window-local prompt copy/paste, profile-wide category approval/reuse, reviewed category migration, cancellation, and Workspace Trust.

Filesystem regressions check conflicts, stale writes/deletes, path confinement, and oversized input. Release-boundary tests check the sole view/command manifest, absence of import/export commands, and preservation of old settings/state. Native save tests verify that user formatting is preserved.

Category migration tests verify legacy mapping, per-prompt choices for `misc` or missing values, cancel-without-write behavior, Workspace Trust, and conflict-safe writes.

The real VS Code host smoke uses an isolated temporary workspace/profile with Workspace Trust enabled and startup prompts disabled. It checks that workspace prompt generation is blocked in Restricted Mode while User prompts remain usable, plus clipboard generation with source preservation, absence of the removed Insert command, starter integrity, and plaintext snapshot preview. The runner restores clipboard contents and removes its temporary workspace data.

Set `VSCODE_TEST_VERSION` to select a VS Code release; it defaults to `stable`. The CI matrix exercises Windows, Linux, and macOS on VS Code 1.96.0 and stable. The 200 ms activation budget is enforced on stable Linux only; compatibility jobs still run all functional assertions. Set `VSCODE_EXECUTABLE_PATH` to use an installed executable instead of a downloaded host. `PROMPTEUR_TEST_SKIP_CLIPBOARD=1` explicitly skips native clipboard checks on hosts where the direct clipboard write/read precondition fails. Skipping does not certify native clipboard behavior. Unit tests still cover copy logic.

Run commands for current results; prior audit/remediation documents describe historical versions. Automated tests do not certify every screen reader/theme, OS filesystem, remote disk, or adversarial concurrent filesystem change. Linux/macOS interactive checks remain useful release gates.

Before removal of import/export, release-boundary validation on Windows passed all 60 tests, the unchanged 91% coverage gates, build, lint, formatting, and real-host smoke with native clipboard checks enabled. Host activation measured 136.5 ms. An initial host run exposed a non-file profile-storage URI, fixed by retaining the local-path fallback and adding a regression test. Run the commands above for current test counts and coverage.

The Activity Bar SVG has an XML/manifest wiring test. Marketplace branding remains a PNG. CI produces a local-installable VSIX; it does not publish.
