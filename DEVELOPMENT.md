# Development

## Setup

- Node.js 22.13+ within major 22, or Node.js 24+; Node.js 23 is unsupported.
- npm 10+; use npm bundled with a supported Node.js release and `npm ci`.
- `engines.node` and `engines.npm` declare compatibility. npm normally warns rather than rejects incompatible engines; these fields are not an enforcement hook.
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
- **Compatibility Validation** is manual-only. It runs host smoke, including Restricted Mode checks, on Windows, macOS, and Linux against VS Code 1.96.0 and stable.
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

Use numeric `major.minor.patch` versions only. Set `vsce.preRelease` in `package.json` to `true` for the Marketplace prerelease channel or `false` for stable in the version PR. Local packaging and the tag workflow use this same boolean; GitHub Release prerelease state follows it. SemVer suffixes such as `-beta.1` are rejected. Stable and prerelease uploads require distinct numeric versions.

The workflow validates the tag, manifest, and both lockfile versions before installing dependencies. GitHub Release creation precedes Marketplace publication: a release-asset failure blocks publication, while a Marketplace failure can leave a GitHub Release available. Inspect both results; rerun transient failures. Correct source/configuration failures through a new version/tag, never by moving protected tags.

Trusted Publishing must target `.github/workflows/publish.yml`; no publishing secret is required.

## CI

- Feature branch push: install and build.
- Pull request to `main`: install, lint, typecheck, unit tests, and host tests on stable VS Code.
- Tag push `v*`: install, build, package, GitHub Release asset, and Marketplace publish.
- Nightly/manual: audit, formatting, and coverage.
- Manual compatibility: supported minimum/stable VS Code on three platforms, including Restricted Mode.
