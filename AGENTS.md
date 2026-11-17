# AGENTS.md

Prompteur: VS Code extension for local, Git-friendly Markdown prompts with YAML frontmatter.
Start at [docs/INDEX.md](./docs/INDEX.md).

## Project layout

- `src/`: extension source; core/application code stays VS Code-independent ([ADR 003](./docs/adr/003-local-safety-boundaries.md), [ADR 005](./docs/adr/005-copilot-prompt-tool.md)).
- `tests/`: unit tests (`vitest`) and host smoke tests.
- `scripts/`: build helpers (`schemas.ts`, `run-host-tests.mjs`).
- `docs/`: documentation. Start at [docs/INDEX.md](./docs/INDEX.md); agent rules for docs are in [docs/AGENTS.md](./docs/AGENTS.md) and for ADRs in [docs/adr/AGENTS.md](./docs/adr/AGENTS.md).

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
- Update related docs with code. Keep [docs/INDEX.md](./docs/INDEX.md) synchronized.
- No extension-owned network/provider calls, telemetry, databases, or shell execution. The user-approved read-only Copilot prompt tool may return requested prompt content/context to the configured model.
- No direct Chat composer insertion; **Copy Text** uses clipboard handoff until VS Code provides a supported API.
- Require Workspace Trust for workspace mutations, generation, and preview.
- Never contradict an accepted ADR; supersede it with a new ADR.
- Add dependencies only when required; update manifest and lockfile together.
- Comment only when clarification is needed.

## GitHub issues

- Assign appropriate existing repository labels when creating every issue. Do not create new labels; if no existing label fits or labeling fails, report it.

## Branch and release workflow

Use feature branches for changes and a release branch for integration. Do not implement directly on `main` or mix unrelated features in one commit. Only changes targeting protected `main` require a pull request; run CI for pull requests targeting `main`. For merges into non-main branches, build and test locally; do not run remote CI. Release preparation authorizes feature commits, pull-request merges, and release metadata updates; ordinary edit requests do not authorize commits automatically.

### GitHub Flow for development

- Keep `main` deployable. Use short-lived, descriptively named branches for small, focused changes.
- Base independent work on the active release branch and keep it current without rewriting published history. Follow the dependency rules below for dependent work.
- Merge features into non-main branches after local build and test validation; pull requests are optional for these branches.
- Integrate tested release branches into `main` through pull requests when explicitly requested. Do not deploy or publish without authorization.
- Retain existing branches unless deletion is explicitly authorized.

### Protected branches and remote publication

- Protect only `main` with the active GitHub ruleset **Protect main and release branches**. Require pull requests with zero required approvals and no required status checks; block force-pushes and deletion; configure no bypass actors.
- Never commit or push directly to protected `main`; merge changes through pull requests after CI passes.
- Non-main branches, including `release/*`, may be merged without pull requests after local build and test validation. Do not run remote CI for these merges.
- Publish branches and updates to configured remotes when needed; do not leave protected `main` refs local-only or divergent.
- Before stopping, verify protected `main` refs match on all configured remotes. Report any remote that could not be updated.

### 1. Inspect and confirm scope

- Inspect `git status --short`, current branch, local branches, recent history, and the complete relevant diff.
- Identify each feature/fix, its dependencies, tests, and directly related docs.
- Confirm target version, base branch, feature boundaries, target remote(s), and any ambiguous inclusion. Default release base: latest published `main`; verify fetched remote refs and local branch state before branching. Require a pull request only when the target is `main`.
- Preserve unrelated changes. Never reset, discard, amend, rebase, force-push, or delete existing branches without explicit authorization.

### 2. Create and publish the release branch

- For release preparation, create `release/v<major>.<minor>.<patch>` from the confirmed published base before integrating features.
- Keep `main` unchanged. Record its starting commit for final verification.
- Reuse an existing release branch only after inspecting its history and confirming that it is the intended target. Never overwrite an existing branch.
- Publish a release branch to configured remotes when needed. Branch creation does not authorize direct updates to protected `main`.
- Do not tag, publish, or merge the release into `main` unless separately requested.

### 3. Create feature branches

- Before implementation, create one `feat/<short-topic>` branch per feature or coherent user-facing fix; use an existing matching feature branch when appropriate.
- Start independent features from the release branch. Start dependent features from the required feature tip or from the release after merging that prerequisite.
- Record dependencies; do not describe dependent branches as independent.
- Push feature branches only when remote publication or a pull request is needed.
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

### 6. Merge features into non-main branches

- Run the relevant build and tests locally before merging; do not run remote CI for non-main branch merges.
- Merge each feature in dependency order. Preserve one explicit merge commit per feature; do not squash or fast-forward feature integration.
- Use a pull request and wait for CI only when the merge target is protected `main`.
- Resolve only understood conflicts on the feature branch; preserve both intended behaviors. Ask for guidance when intent is ambiguous, then rerun affected checks.
- Feature commits may be prepared before integration; dependent branches must still merge in dependency order.

### 7. Prepare release metadata

- Choose SemVer from changes: patch for fixes, minor for backward-compatible features, major for incompatible public behavior or format changes. Assess migration and compatibility explicitly.
- Create a release-metadata feature branch from the release branch. Run `npm version <version> --no-git-tag-version --ignore-scripts` there to update manifest and lockfile without creating a tag or running publication hooks.
- Verify `package.json`, top-level lockfile version, and root package lockfile version agree.
- Move relevant user-facing entries from `Unreleased` to `## <version>` in `CHANGELOG.md`; retain an empty `Unreleased` heading. Do not include internal refactors, tests, or tooling.
- Update the README VSIX installation example and directly related version references. Do not rewrite historical release entries or overwrite existing VSIX files.
- Validate release metadata locally, then commit and merge it into the non-main release branch without remote CI. Use a pull request and CI only if targeting `main`.

### 8. Validate the integrated release

- Run `npm run coverage`, `npm run build`, `npm run lint`, `npm run format:check`, and `git diff --check`. Coverage includes unit tests; build includes type checking.
- Run `npm run test:host` when extension-host behavior changed. Report skipped/unavailable host validation explicitly; do not present mocked runner tests as host smoke execution.
- Do not install/restore dependencies unless manifests changed or a required validation fails because dependencies/tools are missing.
- Inspect generated-file changes; include only intended tracked outputs. Do not package, publish, or replace local VSIX files merely to validate a build.
- Resolve failures introduced by the release before claiming it is ready.

### 9. Verify release state

- Inspect the release-metadata merge commit. Do not commit directly to protected `main`; use a pull request when integrating into `main`.
- Verify every included feature tip is an ancestor of the release using `git merge-base --is-ancestor <feature-branch> <release-branch>`.
- Confirm expected merge commits, matching release versions, unchanged `main` commit, matching remote release refs, and a clean worktree.
- Do not stage unrelated work to obtain a clean status; if unrelated changes remain, preserve and report them.

### 10. Stop at the agreed boundary

- Leave the release branch checked out. Keep feature branches for traceability.
- Report release branch, merged feature branches, version, validation results, and remaining limitations.
- Stop. Keep protected `main` updates published to every configured remote. No tag, GitHub release, Marketplace publication, or merge to `main` without a separate explicit request.

## Commit Messages

Use Conventional Commits with a lowercase type and concise description:

```text
<type>: <description>
```

Common types: `feat` (new feature), `fix` (bug fix), `docs` (documentation), `refactor` (code restructuring), `test` (tests), `perf` (performance), `build` (build changes), `ci` (CI/CD), and `chore` (maintenance).

Examples: `feat: add category filtering`, `fix: handle empty prompt files`, `docs: clarify workspace trust behavior`.
