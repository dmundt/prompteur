import { afterEach, describe, expect, it } from 'vitest';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

describe('host runner VS Code downloads', () => {
  it.each([
    ['1.96.0', 'Electron'],
    ['1.146.0', 'Code'],
  ])('resolves the macOS executable for VS Code %s', async (version, executable) => {
    const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'prompteur-host-runner-')));
    roots.push(root);
    const install = join(root, `vscode-darwin-arm64-${version}`);
    const contents = join(install, 'Visual Studio Code.app', 'Contents');
    const executablePath = join(contents, 'MacOS', executable);
    await fs.mkdir(join(contents, 'MacOS'), { recursive: true });
    await fs.writeFile(join(install, 'is-complete'), '');
    await fs.writeFile(
      join(contents, 'Info.plist'),
      `<plist><dict><key>CFBundleExecutable</key><string>${executable}</string></dict></plist>`,
    );
    await fs.writeFile(executablePath, '');

    await expect(
      downloadAndUnzipVSCode({ version, platform: 'darwin-arm64', cachePath: root }),
    ).resolves.toBe(executablePath);
  });
});
