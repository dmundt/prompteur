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

## GitHub issues

- Assign appropriate existing repository labels when creating every issue. Do not create new labels; if no existing label fits or labeling fails, report it.

## GitHub Flow and releases

- Keep `main` deployable. Base each independent, short-lived feature branch on the latest published `main`; use a descriptive name. Keep unrelated changes separate. Record dependencies when a branch must start from a prerequisite.
- Make changes on the feature branch, with behavior tests and directly related documentation. Preserve unrelated work. Never reset, discard, amend, rebase, force-push, or delete existing branches without explicit authorization.
- Publish feature branches needed for pull requests to every applicable remote. Open pull requests into `main`; address requested reviews and merge only after required checks pass. Use merge commits and include the co-author trailer below.
- Ordinary edit requests do not authorize commits, pull-request merges, tags, or publication. Retain branches unless deletion is explicitly authorized.
- Protect `main` and every existing or new `release/*` branch with the active GitHub ruleset **Protect main and release branches**. Require pull requests, zero approving reviews, and all six GitHub Actions quality matrix checks. Block force-pushes and deletion; configure no bypass actors.
- Never commit or push directly to protected branches. Publish approved updates through pull requests to every configured remote. Verify protected refs match on all remotes; report any divergence or remote that could not be updated.
- Release branches are not the default integration target. Create or update one only when explicitly requested, using the same protected-branch and remote-publication rules.
- For release metadata, create a feature branch from published `main`. Choose SemVer from the included changes and assess compatibility. Run `npm version <version> --no-git-tag-version --ignore-scripts`; verify manifest and lockfile versions agree. Move user-facing changelog entries to the release version, retain `Unreleased`, and update the README VSIX example.
- Before declaring a release ready, run `npm run coverage`, `npm run build`, `npm run lint`, `npm run format:check`, and `git diff --check`; run `npm run test:host` when extension-host behavior changed. Report unavailable validation. Do not package, tag, publish, or deploy without explicit authorization.
- Include this trailer on feature, merge, and release commits:

  ```text
  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  ```

## Commit Messages

Use Conventional Commits with a lowercase type and concise description:

```text
<type>: <description>
```

Common types: `feat` (new feature), `fix` (bug fix), `docs` (documentation), `refactor` (code restructuring), `test` (tests), `perf` (performance), `build` (build changes), `ci` (CI/CD), and `chore` (maintenance).

Examples: `feat: add category filtering`, `fix: handle empty prompt files`, `docs: clarify workspace trust behavior`.
