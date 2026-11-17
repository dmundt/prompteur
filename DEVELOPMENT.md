# Development

## Setup

- Node.js 22.12+
- Desktop VS Code 1.96+

```sh
npm ci
```

`npm ci` installs Husky hooks through the `prepare` script.

## Local checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
```

- Pre-commit: `lint-staged` formats staged files and runs ESLint on staged JavaScript/TypeScript.
- Pre-push: runs `npm run typecheck` and `npm test`.
- Host smoke: `npm run test:host`. PR CI runs it on stable VS Code; run locally to diagnose host-specific failures.
- `npm run package` creates a local VSIX; it does not publish.

## Release

Release only from a tag on `main`; never publish on merge:

1. Update `package.json` and `package-lock.json` version through a feature PR:

   ```sh
   npm version <version> --no-git-tag-version --ignore-scripts
   ```

2. Merge the version PR to `main`.
3. Create and push a matching tag:

   ```sh
   git switch main
   git pull --ff-only origin main
   git tag v<version>
   git push origin v<version>
   ```

4. `.github/workflows/publish.yml` validates the tag, builds and packages the VSIX, uploads it as an Actions artifact and GitHub Release asset, then publishes to the VS Code Marketplace using Trusted Publishing.

Prerelease versions use VS Code Marketplace prerelease publishing. Trusted Publishing must target `.github/workflows/publish.yml`; no publishing secret is required.

## CI

- Feature push, excluding `main`: install and build.
- Pull request to `main`: install, lint, typecheck, unit tests, host smoke on stable VS Code.
- Tag push `v*`: install, build, package, release asset, Marketplace publish.
- Nightly/manual: audit, formatting, and coverage.
