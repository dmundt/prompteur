import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'check-shared.mjs');
const paths = [
  'scripts/check-shared.mjs',
  'scripts/check-shared.test.mjs',
  'scripts/release.mjs',
  'scripts/release.test.mjs',
  'docs/engineering-standards.md',
  '.github/pull_request_template.md',
  '.github/ISSUE_TEMPLATE/bug.yml',
  '.github/ISSUE_TEMPLATE/feature.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
];

test('shared check reports matching, different, and missing files', () => {
  const peer = mkdtempSync(join(tmpdir(), 'shared-check-'));
  try {
    for (const path of paths) {
      mkdirSync(dirname(join(peer, path)), { recursive: true });
      copyFileSync(join(root, path), join(peer, path));
    }
    const run = () => spawnSync(process.execPath, [script, peer], { encoding: 'utf8' });
    assert.equal(run().status, 0);
    writeFileSync(join(peer, 'scripts/release.mjs'), 'different');
    let result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Shared file differs: scripts\/release\.mjs/);
    unlinkSync(join(peer, 'scripts/release.test.mjs'));
    result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Cannot compare scripts\/release\.test\.mjs/);
  } finally {
    rmSync(peer, { recursive: true, force: true });
  }
});

test('shared check requires a peer path', () => {
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Usage:/);
});
