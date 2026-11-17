import console from 'node:console';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const peer = process.argv[2];
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

if (!peer || process.argv.length !== 3) {
  console.error('Usage: node scripts/check-shared.mjs <peer-repository>');
  process.exitCode = 1;
} else {
  for (const path of paths) {
    try {
      if (!readFileSync(join(root, path)).equals(readFileSync(join(peer, path)))) {
        console.error(`Shared file differs: ${path}`);
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(`Cannot compare ${path}: ${error.message}`);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log('Shared engineering files match.');
}
