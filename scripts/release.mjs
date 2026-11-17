import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export function validateRelease(manifest, lockfile, tag) {
  const { version } = manifest;
  if (typeof version !== 'string' || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version))
    throw new Error('Marketplace releases require a numeric major.minor.patch version.');
  if (tag !== `v${version}`)
    throw new Error(`Tag ${tag} does not match package version ${version}.`);
  if (lockfile.version !== version || lockfile.packages?.['']?.version !== version)
    throw new Error('Package and lockfile versions must match.');
  if (typeof manifest.vsce?.preRelease !== 'boolean')
    throw new Error('Set vsce.preRelease to true or false in package.json.');
  return { version, prerelease: manifest.vsce.preRelease };
}

export function validateExistingRelease(release, prerelease, name, candidate, published) {
  if (release.isDraft !== false || release.isPrerelease !== prerelease)
    throw new Error('Existing GitHub release must be published in the requested channel.');
  if (
    !Array.isArray(release.assets) ||
    release.assets.some((asset) => !asset || typeof asset.name !== 'string' || !asset.name)
  )
    throw new Error('Existing GitHub release assets are missing or invalid.');
  const assets = release.assets.filter((asset) => asset.name === name);
  if (assets.length > 1 || (assets.length === 0) !== (published === undefined))
    throw new Error('Existing GitHub release asset state does not match the downloaded asset.');
  if (published !== undefined && !candidate.equals(published))
    throw new Error('Existing GitHub release asset differs from the VSIX being published.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--verify-existing') {
    if (!['true', 'false'].includes(process.env.PRERELEASE))
      throw new Error('Set PRERELEASE to true or false.');
    const [, , , metadata, candidate, published] = process.argv;
    validateExistingRelease(
      JSON.parse(readFileSync(metadata, 'utf8')),
      process.env.PRERELEASE === 'true',
      basename(candidate),
      readFileSync(candidate),
      published === undefined ? undefined : readFileSync(published),
    );
  } else {
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const release = validateRelease(manifest, lockfile, process.env.TAG);
    process.stdout.write(`version=${release.version}\nprerelease=${release.prerelease}\n`);
  }
}
