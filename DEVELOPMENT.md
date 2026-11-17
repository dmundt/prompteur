# Development

## Setup

- Node.js 22.13 or newer.
- Use npm bundled with Node.js 22; use `npm ci` instead of installing npm globally.
- Desktop VS Code 1.96 or newer.

```sh
npm ci
```

`npm ci` installs Husky hooks through `prepare`.

## Local checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
npm run test:host
```

- Pre-commit: `lint-staged` formats staged files and runs ESLint on staged JavaScript/TypeScript.
- Pre-push: runs `npm run typecheck` and `npm test`.
- Host smoke: `npm run test:host` runs the extension in VS Code; use it for host-specific failures.
- `npm run package` creates a local VSIX; it does not publish.

## Release

Release only from a tag on `main`; merging a pull request never publishes:

1. Update `package.json` and `package-lock.json` in a feature pull request:

   ```sh
   npm version <version> --no-git-tag-version --ignore-scripts
   ```

2. Merge the version change to `main`.
3. Create and push a matching tag:

   ```sh
   git switch main
   git pull --ff-only origin main
   git tag v<version>
   git push origin v<version>
   ```

4. `.github/workflows/publish.yml` validates the version and `main` ancestry, builds and packages the VSIX, uploads it as an Actions artifact and GitHub Release asset, then publishes through Marketplace Trusted Publishing.

Prerelease versions use Marketplace prerelease publishing. Trusted Publishing must target `.github/workflows/publish.yml`; no publishing secret is required.

## CI

- Feature branch push: install and build.
- Pull request to `main`: install, lint, typecheck, unit tests, and host tests on stable VS Code.
- Tag push `v*`: install, build, package, GitHub Release asset, and Marketplace publish.
- Nightly/manual: audit, formatting, and coverage.
