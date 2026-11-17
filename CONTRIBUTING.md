# Contributing

## GitHub Flow

`main` is the only long-lived branch. Use short-lived feature branches:

1. Update `main`: `git switch main` then `git pull --ff-only origin main`.
2. Create a branch: `git switch -c feat/<short-topic>` or `fix/<short-topic>`.
3. Implement and validate locally.
4. Push the branch and open a pull request targeting `main`.
5. Wait for **PR validation** to pass, then merge.
6. Delete the feature branch; repository settings delete merged branches automatically.

Do not push directly to `main` or create `develop`, release, or long-lived feature branches. See [GitHub settings](./docs/github-settings.md).

## Before opening a pull request

Install dependencies and Git hooks with `npm ci`. Pre-commit formats staged files and lints staged TypeScript; pre-push runs typecheck and unit tests.

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Keep pull requests focused. Describe behavior changes and list validation performed. Never include secrets or private prompt content.

## Changes and commits

- Add focused tests for behavior changes.
- Update user-facing documentation with behavior changes.
- Add architecture decisions to [the ADRs](./docs/adr/) and keep the documentation index current.
- Follow [shared engineering standards](./docs/engineering-standards.md).
- Use Conventional Commits: `<type>: <description>`.
- Do not add `Co-authored-by:` trailers.
