import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  const lockfile = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const release = validateRelease(manifest, lockfile, process.env.TAG);
  process.stdout.write(`version=${release.version}\nprerelease=${release.prerelease}\n`);
}
