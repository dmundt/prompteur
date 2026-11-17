import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateRelease } from './release.mjs';

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
