import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { validateExistingRelease, validateRelease } from './release.mjs';

function fixture(preRelease = false, version = '1.2.3') {
  return {
    manifest: { version, vsce: { preRelease } },
    lockfile: { version, packages: { '': { version } } },
    tag: `v${version}`,
  };
}

test('numeric versions select the explicit stable or prerelease channel', () => {
  for (const prerelease of [false, true]) {
    const { manifest, lockfile, tag } = fixture(prerelease);
    assert.deepEqual(validateRelease(manifest, lockfile, tag), { version: '1.2.3', prerelease });
  }
});

test('unsupported Marketplace version suffixes and nonnumeric versions are rejected', () => {
  for (const version of ['1.2.3-beta.1', '1.2.3+build', '01.2.3', '1.2', undefined]) {
    const { manifest, lockfile, tag } = fixture(false);
    manifest.version = version;
    assert.throws(() => validateRelease(manifest, lockfile, tag), /numeric major.minor.patch/);
  }
});

test('tags and both lockfile version locations must match the manifest', () => {
  const { manifest, lockfile } = fixture();
  assert.throws(() => validateRelease(manifest, lockfile, 'v9.9.9'), /does not match/);
  assert.throws(
    () => validateRelease(manifest, { ...lockfile, version: '9.9.9' }, 'v1.2.3'),
    /lockfile versions must match/,
  );
  assert.throws(
    () => validateRelease(manifest, { ...lockfile, packages: {} }, 'v1.2.3'),
    /lockfile versions must match/,
  );
});

test('release channel must be an explicit boolean', () => {
  for (const preRelease of [undefined, 'false', 0]) {
    const { manifest, lockfile, tag } = fixture();
    manifest.vsce.preRelease = preRelease;
    assert.throws(() => validateRelease(manifest, lockfile, tag), /vsce.preRelease/);
  }
});

test('existing releases must be published in the requested channel', () => {
  const candidate = Buffer.from('VSIX');
  for (const prerelease of [false, true]) {
    const release = { isDraft: false, isPrerelease: prerelease, assets: [] };
    assert.doesNotThrow(() => validateExistingRelease(release, prerelease, 'x.vsix', candidate));
    assert.throws(
      () => validateExistingRelease({ ...release, isDraft: true }, prerelease, 'x.vsix', candidate),
      /must be published/,
    );
    assert.throws(
      () => validateExistingRelease(release, !prerelease, 'x.vsix', candidate),
      /requested channel/,
    );
  }
});

test('existing release assets must match the candidate VSIX', () => {
  const release = { isDraft: false, isPrerelease: false, assets: [{ name: 'x.vsix' }] };
  const candidate = Buffer.from('VSIX');
  assert.doesNotThrow(() =>
    validateExistingRelease(release, false, 'x.vsix', candidate, Buffer.from('VSIX')),
  );
  assert.throws(
    () => validateExistingRelease(release, false, 'x.vsix', candidate, Buffer.from('different')),
    /differs from the VSIX/,
  );
  assert.throws(() => validateExistingRelease(release, false, 'x.vsix', candidate), /asset state/);
  for (const assets of [null, [null], [{}], [{ name: '' }]]) {
    assert.throws(
      () => validateExistingRelease({ ...release, assets }, false, 'x.vsix', candidate),
      /assets are missing or invalid/,
    );
  }
});

test('release verification CLI rejects a different existing VSIX', () => {
  const directory = mkdtempSync(join(tmpdir(), 'prompteur-release-test-'));
  try {
    const metadata = join(directory, 'release.json');
    const candidate = join(directory, 'x.vsix');
    const published = join(directory, 'published.vsix');
    writeFileSync(
      metadata,
      JSON.stringify({ isDraft: false, isPrerelease: false, assets: [{ name: 'x.vsix' }] }),
    );
    writeFileSync(candidate, 'candidate');
    writeFileSync(published, 'candidate');
    const verify = () =>
      spawnSync(
        process.execPath,
        ['scripts/release.mjs', '--verify-existing', metadata, candidate, published],
        {
          env: { ...process.env, PRERELEASE: 'false' },
          encoding: 'utf8',
        },
      );
    assert.equal(verify().status, 0);
    writeFileSync(published, 'different');
    const result = verify();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /differs from the VSIX/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
