# Contributing

## GitHub Flow

`main` is the only long-lived branch. Use short-lived feature branches:

1. Update `main`: `git switch main` then `git pull --ff-only origin main`.
2. Create a branch: `git switch -c feat/<short-topic>`.
3. Implement and validate locally.
4. Push: `git push -u origin feat/<short-topic>`.
5. Open a pull request targeting `main`.
6. Wait for **PR validation** to pass, then merge.
7. Delete the feature branch; repository settings delete merged head branches automatically.

Do not push directly to `main`. Do not create `develop`, release, or long-lived feature branches. See [GitHub settings](./docs/github-settings.md).

## Before opening a pull request

Pre-commit hooks format staged files and lint staged JavaScript/TypeScript. Pre-push hooks run typecheck and unit tests. Run build when changing packaging, schemas, or extension integration:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Keep pull requests focused. Include summary, behavior impact, and validation performed. Never include secrets or private prompt content.
