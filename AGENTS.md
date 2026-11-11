# AGENTS.md

Prompteur is a VS Code extension for local, Git-friendly YAML prompts. Read [docs/index.md](./docs/index.md) first to find the document for your task.

## Project layout

- `src/`: extension source. Core/application code must stay independent of VS Code (see [ADR 003](./docs/adr/003-local-safety-boundaries.md)).
- `tests/`: unit tests (`vitest`) and host smoke tests.
- `scripts/`: build helpers (`schemas.ts`, `run-host-tests.mjs`).
- `docs/`: documentation. Start at [docs/index.md](./docs/index.md); agent rules for docs are in [docs/AGENTS.md](./docs/AGENTS.md) and for ADRs in [docs/adr/AGENTS.md](./docs/adr/AGENTS.md).

## Validation commands

Run the smallest command that covers your change, then escalate as needed.

- Type check: `npm run check`
- Unit tests: `npm test`
- Lint: `npm run lint`
- Format check: `npm run format:check`
- Full build: `npm run build`
- Host tests: `npm run test:host`

## Change rules

- Make surgical changes. Do not fix unrelated pre-existing issues.
- Keep the extension deliberately boring, simple, and functional. Every feature, label, popup, text, icon, and action must serve an explicit requirement or clear usability need; otherwise, omit it. Prefer native VS Code patterns and the smallest sufficient solution.
- Keep the Marketplace README introduction to 5–15 factual, scannable lines explaining who the extension is for, what it does, and its concrete differentiators. Avoid hype, buzzwords, filler, and claims that cannot be verified.
- After each change, check README and CHANGELOG against the resulting product. Keep README accurate to current user-facing behavior; record only user-facing changes in CHANGELOG. Do not log internal-only refactors, tests, or tooling changes.
- Update directly related documentation in the same change, and keep [docs/index.md](./docs/index.md) in sync with any document you add, rename, or remove.
- Do not add network access, telemetry, databases, or shell execution. The extension must not invoke AI tools or insert into Chat.
- Workspace mutations, prompt generation, and preview require Workspace Trust.
- Do not contradict an accepted ADR. Supersede it with a new ADR instead.
- Do not add dependencies unless the task requires them. Update `package.json` and the lockfile together.
- Only comment code that needs clarification.

## Commit Messages

Use Conventional Commits with a lowercase type and concise description:

```text
<type>: <description>
```

Common types: `feat` (new feature), `fix` (bug fix), `docs` (documentation), `refactor` (code restructuring), `test` (tests), `perf` (performance), `build` (build changes), `ci` (CI/CD), and `chore` (maintenance).

Examples: `feat: add category filtering`, `fix: handle empty prompt files`, `docs: clarify workspace trust behavior`.
