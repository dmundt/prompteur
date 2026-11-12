# AGENTS.md

Prompteur: VS Code extension for local, Git-friendly Markdown prompts with YAML frontmatter.
Start at [docs/index.md](./docs/index.md).

## Project layout

- `src/`: extension source; core/application code stays VS Code-independent ([ADR 003](./docs/adr/003-local-safety-boundaries.md), [ADR 005](./docs/adr/005-copilot-prompt-tool.md)).
- `tests/`: unit tests (`vitest`) and host smoke tests.
- `scripts/`: build helpers (`schemas.ts`, `run-host-tests.mjs`).
- `docs/`: documentation. Start at [docs/index.md](./docs/index.md); agent rules for docs are in [docs/AGENTS.md](./docs/AGENTS.md) and for ADRs in [docs/adr/AGENTS.md](./docs/adr/AGENTS.md).

## Validation commands

Run the smallest relevant check, then escalate if needed.

- Type check: `npm run check`
- Unit tests: `npm test`
- Lint: `npm run lint`
- Format check: `npm run format:check`
- Full build: `npm run build`
- Host tests: `npm run test:host`

## Change rules

- Keep changes surgical; leave unrelated defects untouched.
- Markdown: dense English only. No filler, fluff, or narrative prose. Use concise facts, lists, tables, and direct instructions. Keep prompt text functional and brief. Preserve third-party/legal notices verbatim.
- Before 1.0.0, treat releases as public betas. Document breaking format/metadata changes and assess migration and compatibility for existing users.
- Keep UI boring, simple, functional, and native. Every visible element must serve a requirement or usability need.
- Marketplace README introduction: 5–15 factual, scannable lines. No hype, unverifiable claims, or filler.
- Keep README current; log only user-facing changes in CHANGELOG. Do not log internal refactors, tests, or tooling.
- Update related docs with code. Keep [docs/index.md](./docs/index.md) synchronized.
- No extension-owned network/provider calls, telemetry, databases, or shell execution. The user-approved read-only Copilot prompt tool may return requested prompt content/context to the configured model.
- No direct Chat composer insertion; **Copy Text** uses clipboard handoff until VS Code provides a supported API.
- Require Workspace Trust for workspace mutations, generation, and preview.
- Never contradict an accepted ADR; supersede it with a new ADR.
- Add dependencies only when required; update manifest and lockfile together.
- Comment only when clarification is needed.

## Branch and release workflow

Use feature branches for changes and a release branch for integration. Do not implement directly on `main` or mix unrelated features in one commit. Release preparation authorizes local feature commits, merges, and release metadata updates; ordinary edit requests do not authorize commits automatically.

### 1. Inspect and confirm scope

- Inspect `git status --short`, current branch, local branches, recent history, and the complete relevant diff.
- Identify each feature/fix, its dependencies, tests, and directly related docs.
- Confirm target version, base branch, feature boundaries, and any ambiguous inclusion. Default release base: local `main`; do not assume it matches the remote.
- Preserve unrelated changes. Never reset, discard, amend, rebase, force-push, or delete existing branches without explicit authorization.

### 2. Create the release branch

- For release preparation, create `release/v<major>.<minor>.<patch>` from the confirmed base before integrating features.
- Keep `main` unchanged. Record its starting commit for final verification.
- Reuse an existing release branch only after inspecting its history and confirming that it is the intended target. Never overwrite an existing branch.
- Do not push, tag, publish, or merge the release into `main` unless separately requested.

### 3. Create feature branches

- Before implementation, create one `feat/<short-topic>` branch per feature or coherent user-facing fix; use an existing matching feature branch when appropriate.
- Start independent features from the release branch. Start dependent features from the required feature tip or from the release after merging that prerequisite.
- Record dependencies; do not describe dependent branches as independent.
- Keep code, behavior tests, and directly related documentation together. Avoid separate branches for incidental files or every small label change.

### 4. Separate existing uncommitted work safely

- If features already overlap in the worktree, preserve all modified/untracked in-scope files before splitting. Store temporary snapshots outside the repository and record content hashes.
- Split shared files by coherent hunks or index-only staging. Do not stage entire mixed files into the wrong feature.
- Preserve the final intended content; do not introduce new behavior while rearranging history.
- Inspect each staged diff and run `git diff --cached --check` before committing.
- Verify recombined feature content matches the saved final content before release metadata edits. Remove temporary snapshots only after committed content is verified.

### 5. Validate and commit each feature

- Run the smallest relevant tests/checks for the feature; fix failures caused by that feature.
- Inspect `git diff --cached` and ensure only intended changes are staged.
- Use Conventional Commits as specified below. Include this trailer on feature, merge, and release commits:

  ```text
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```

- Do not amend existing commits or create an unrelated all-features snapshot commit as a substitute for feature separation.

### 6. Merge features into the release

- Switch to the release branch with a clean worktree before merging.
- Merge each feature in dependency order with `git merge --no-ff <feature-branch>` and a descriptive merge message.
- Preserve one explicit merge commit per feature. Do not squash or fast-forward feature integration.
- Resolve only understood conflicts; preserve both intended behaviors. Ask for guidance when intent is ambiguous, then rerun affected checks.
- Feature commits may be prepared before integration; dependent branches must still merge in dependency order.

### 7. Prepare release metadata

- Choose SemVer from changes: patch for fixes, minor for backward-compatible features, major for incompatible public behavior or format changes. Assess migration and compatibility explicitly.
- On the release branch, run `npm version <version> --no-git-tag-version --ignore-scripts` to update manifest and lockfile without creating a tag or running publication hooks.
- Verify `package.json`, top-level lockfile version, and root package lockfile version agree.
- Move relevant user-facing entries from `Unreleased` to `## <version>` in `CHANGELOG.md`; retain an empty `Unreleased` heading. Do not include internal refactors, tests, or tooling.
- Update the README VSIX installation example and directly related version references. Do not rewrite historical release entries or overwrite existing VSIX files.

### 8. Validate the integrated release

- Run `npm run coverage`, `npm run build`, `npm run lint`, `npm run format:check`, and `git diff --check`. Coverage includes unit tests; build includes type checking.
- Run `npm run test:host` when extension-host behavior changed. Report skipped/unavailable host validation explicitly; do not present mocked runner tests as host smoke execution.
- Do not install/restore dependencies unless manifests changed or a required validation fails because dependencies/tools are missing.
- Inspect generated-file changes; include only intended tracked outputs. Do not package, publish, or replace local VSIX files merely to validate a build.
- Resolve failures introduced by the release before claiming it is ready.

### 9. Commit and verify release state

- Inspect and stage only release metadata changes. Commit with `chore: prepare <version> release` and the required trailer.
- Verify every included feature tip is an ancestor of the release using `git merge-base --is-ancestor <feature-branch> <release-branch>`.
- Confirm expected merge commits, matching release versions, unchanged `main` commit, and a clean worktree.
- Do not stage unrelated work to obtain a clean status; if unrelated changes remain, preserve and report them.

### 10. Stop at the agreed boundary

- Leave the release branch checked out. Keep feature branches for traceability.
- Report release branch, merged feature branches, version, validation results, and remaining limitations.
- Stop. No push, tag, GitHub release, Marketplace publication, or merge to `main` without a separate explicit request.

## Commit Messages

Use Conventional Commits with a lowercase type and concise description:

```text
<type>: <description>
```

Common types: `feat` (new feature), `fix` (bug fix), `docs` (documentation), `refactor` (code restructuring), `test` (tests), `perf` (performance), `build` (build changes), `ci` (CI/CD), and `chore` (maintenance).

Examples: `feat: add category filtering`, `fix: handle empty prompt files`, `docs: clarify workspace trust behavior`.
