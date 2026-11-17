# Engineering Standards

Shared development expectations for Stemlink and Prompteur. Product-specific build systems, test frameworks, VS Code minimums, and runtime dependencies remain documented in each repository.

## Code and dependencies

- Keep changes focused, typed, and consistent with existing patterns.
- Use Prettier with single quotes, trailing commas, 100-column width, and LF line endings. Git attributes normalize text files; preserve binary assets.
- Keep core logic independent of VS Code APIs where practical.
- Use existing runtime dependencies and built-in APIs; justify new runtime packages.
- Update `package.json` and `package-lock.json` together.
- Keep `@types/vscode` within the declared minimum VS Code minor using a tilde range; do not compile against newer host APIs.
- Require Workspace Trust for workspace mutations, generation, and preview.
- Keep local data local; do not add telemetry or extension-owned provider calls.

## Tests and local validation

Run checks relevant to changed behavior; builds must remain reproducible:

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run format:check
```

Run `npm run test:host` for extension-host behavior. Host tests exercise core workflows, Restricted Mode trust guards, and relevant failure or recovery paths. Add focused tests for behavior changes. Keep platform-wide or expensive validation out of the standard pull-request path unless a change requires it.

## GitHub Flow and pull requests

- `main` is the only long-lived branch; use short-lived `feat/*`, `fix/*`, or `docs/*` branches.
- Validate locally, push the branch, and open a pull request targeting `main`.
- Do not push directly to `main`; merge only after **PR validation** passes.
- Keep pull requests focused. Explain behavior impact and list checks run.
- Use Conventional Commits: `<type>: <description>`.
- Do not add `Co-authored-by:` trailers.

## Documentation

- Update related user and developer documentation with behavior changes.
- Record only user-facing changes in `CHANGELOG.md`.
- Add an ADR for architectural decisions and keep the ADR index current.
- Name documentation indexes `INDEX.md` and keep extension icons in `media/`. Let generators own the formatting of generated vault indexes.
- Keep documentation factual, concise, and free of unsupported claims.

## Dependencies and CI

- Use weekly Dependabot updates for npm and GitHub Actions.
- Keep automatic VS Code typings updates within the supported minimum minor. Review Node typings, TypeScript, and lint-staged major upgrades manually against supported APIs, compiler peers, and minimum Node versions.
- Feature branch CI installs dependencies and builds.
- Pull request CI runs lint, typecheck, unit tests, and existing host tests.
- Nightly/manual workflows run audits, formatting checks, coverage, and other expensive validation.
- Cancel superseded validation runs on the same ref. Bound build jobs to 5 minutes, PR jobs to 10, heavy validation to 20, and each release job to 10; never automatically cancel publication.
- Gate coverage at 95% lines, 91% branches, and 93% functions. Retain additional runner-specific gates and document differing coverage scopes; percentages are not directly comparable. Manual compatibility validation covers supported minimum/stable VS Code on Windows, macOS, and Linux, including Restricted Mode.
- Do not publish from a merge to `main`.

## Releases

- Release from a matching `v<version>` tag on `main`.
- Use numeric versions and explicit boolean `vsce.preRelease` for stable/prerelease selection. Validate the manifest and both lockfile versions; reject SemVer prerelease suffixes.
- Validate the manifest version, build, and package a VSIX before publication.
- Attach the VSIX to a GitHub Release and publish to Marketplace only through configured Trusted Publishing.
- Before retrying Marketplace publication, verify an existing GitHub Release is published in the requested channel and its existing VSIX asset matches the package byte for byte.
- Keep release notes and version metadata aligned with the package.
- Keep the release verifier and its tests identical across both repositories. Nightly validation compares them, these standards, and community templates against the other repository's published `main`. Coordinate changes across both repositories; transient drift during integration fails the nightly check.
