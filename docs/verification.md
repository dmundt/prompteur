# Verification

```sh
npm run lint
npm run format:check
npm run coverage
npm run build
npm run test:host
npm run package
```

- Coverage gate: 91% for lines, statements, functions, branches across `src/`, including VS Code adapters.
- Remove tests for removed features; do not retain compatibility scaffolding.

- Unit/integration coverage: metadata-only frontmatter; category approval/removal guards/count modes; settings defaults/overrides and gear command; comments/unknown fields; malformed delimiters/YAML/aliases/depth; exact body preservation; ignored YAML; path identity; conflicts/recovery; resource/path safety; search/filters/tooltips; 10k search; groups/batches/watchers; variables; CRUD/previews/Copy Text/prompt copy/paste and buffer enablement; isolated clipboard menu group and hidden legacy actions; legacy command compatibility; read-only Copilot prompt search/render, confirmation, and Workspace Trust; cancellation.

- Filesystem tests: conflicts, stale writes/deletes, path confinement, oversized input.
- Release-boundary tests: sole view, contributed commands and one read-only tool; no import/export or extension dependency; old state preserved.
- Native-save tests: preserve user formatting.

- Host smoke: isolated workspace/profile; Trust enabled; startup prompts disabled.
- Checks Restricted Mode blocking, User prompt use, clipboard handoff, source preservation, removed Insert command, starters, and plaintext preview.
- Host smoke verifies Language Model Tool registration when supported; tool search/render is unit-tested with a VS Code API mock. Tests and extension code make no model-provider requests.
- Runner restores clipboard and removes temp workspace data.

- `VSCODE_TEST_VERSION`: select host version; default `stable`.
- CI: Windows/Linux/macOS; VS Code 1.96.0 and stable. Enforce 200 ms activation on stable Linux only.
- `VSCODE_EXECUTABLE_PATH`: use installed host.
- `PROMPTEUR_TEST_SKIP_CLIPBOARD=1`: skip failed native clipboard precondition. This does not certify clipboard behavior; unit tests cover copy logic.

- Run commands for current results. Audit/remediation files are historical.
- Tests do not certify every screen reader/theme, filesystem, remote disk, or adversarial race. Linux/macOS interactive checks remain useful.

- Historical pre-import/export run: 60 tests; 91% coverage; build/lint/format/host passed; clipboard enabled; activation 136.5 ms.
- Earlier host exposed non-file profile storage; local-path fallback and regression test fixed it.

- Activity Bar SVG: XML/manifest test. Marketplace icon: PNG.
- CI builds local-installable VSIX on pushes and pull requests.
- Publishing a GitHub release runs the full CI matrix, then attaches its VSIX to the release and publishes the same VSIX to VS Code Marketplace using Trusted Publishing. Release tags must match the package version, with an optional `v` prefix. GitHub prereleases publish as Marketplace prereleases.
- Release asset upload requires `contents: write` and fails rather than replacing an existing asset.
- Marketplace Trusted Publishing policy must target `.github/workflows/publish.yml` without a GitHub environment. The publish job requires `id-token: write`.
