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

- Type check: `npm run typecheck`
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

## GitHub Flow

`main` is the only long-lived branch. Use short-lived feature branches; do not create `develop` or `release/*` branches.

- Inspect worktree, branch, recent history, and relevant diff before editing. Preserve unrelated work.
- Start branches from current `main`; use descriptive names such as `feat/<topic>` or `fix/<topic>`.
- Run local lint, typecheck, unit tests, and relevant build before pushing. Pre-commit and pre-push hooks enforce fast checks.
- Feature pushes run install and build only. Merges into non-main branches require local build/test, not remote CI.
- Open pull requests targeting `main`; never push directly to it. Require **PR validation** before merge.
- Configure `main` rules to block force-push and deletion, dismiss stale approvals, and allow no bypass actors. Configure automatic deletion of merged head branches; see [GitHub settings](./docs/github-settings.md).
- Keep changes focused. Never reset, discard, amend, rebase, force-push, or delete branches without explicit authorization.

## Releases

- Releases are explicit and tag-driven; merges to `main` never publish.
- Update package and lockfile versions in a feature PR. After merge, tag the corresponding `main` commit `v<version>` and push the tag.
- `.github/workflows/publish.yml` validates exact tag/version match, builds and packages the VSIX, creates a GitHub Release, and publishes to Marketplace through Trusted Publishing.
- Keep prereleases marked as prereleases. Do not publish without an explicit request.
- Use numeric package versions and the boolean `vsce.preRelease` for release-channel selection. SemVer prerelease suffixes are unsupported. Both lockfile versions must match the manifest.

## Validation and commits

- Run the smallest relevant checks. Standard local checks: `npm run lint`, `npm run typecheck`, `npm test`; `npm run build` includes typecheck.
- PR CI runs host smoke on stable VS Code. Nightly/manual CI covers audit, formatting, and coverage.
- Release tags must point to a commit on `main`; the tag workflow validates this before packaging or publishing.
- Do not install/restore dependencies unless manifests changed or validation reports missing tools.
- Use Conventional Commits as specified below. Do not add `Co-authored-by:` trailers.

- Inspect staged changes and run `git diff --cached --check` before committing. Do not amend existing commits or stage unrelated work as a shortcut.

## Commit Messages

Use Conventional Commits with a lowercase type and concise description:

```text
<type>: <description>
```

Common types: `feat` (new feature), `fix` (bug fix), `docs` (documentation), `refactor` (code restructuring), `test` (tests), `perf` (performance), `build` (build changes), `ci` (CI/CD), and `chore` (maintenance).

Examples: `feat: add category filtering`, `fix: handle empty prompt files`, `docs: clarify workspace trust behavior`.
