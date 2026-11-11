import { spawn } from 'node:child_process';
import process from 'node:process';
import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';

const root = await mkdtemp(join(tmpdir(), 'prompteur-host-'));
const workspace = join(root, 'sample-project');
await mkdir(join(workspace, '.vscode', 'prompts', 'prompts'), { recursive: true });
await writeFile(
  join(workspace, '.vscode', 'prompts', 'prompts', 'review.yaml'),
  'version: 1\nname: Review\ncategory: review\ncontent: Review {{selection}} in {{filename}}\n',
);
let executable = process.env.VSCODE_EXECUTABLE_PATH;
if (
  !executable &&
  !process.env.VSCODE_TEST_VERSION &&
  process.platform === 'win32' &&
  process.env.LOCALAPPDATA
) {
  const installed = join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe');
  try {
    await access(installed);
    executable = installed;
  } catch {
    executable = undefined;
  }
}
try {
  executable ??= await downloadAndUnzipVSCode({
    version: process.env.VSCODE_TEST_VERSION ?? 'stable',
    cachePath: resolve('.vscode-test'),
  });
  const profile = join(root, 'profile');
  await mkdir(join(profile, 'User'), { recursive: true });
  await writeFile(
    join(profile, 'User', 'settings.json'),
    JSON.stringify({
      'security.workspace.trust.enabled': true,
      'security.workspace.trust.startupPrompt': 'never',
    }),
  );
  const args = [
    workspace,
    '--user-data-dir',
    profile,
    '--extensions-dir',
    join(root, 'extensions'),
    '--disable-extensions',
    '--skip-welcome',
    '--skip-release-notes',
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-updates',
    `--extensionTestsPath=${resolve('dist/host-smoke.cjs')}`,
    `--extensionDevelopmentPath=${resolve('.')}`,
  ];
  const child = spawn(executable, args, { stdio: 'inherit' });
  const exitCode = await new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`VS Code host smoke failed with exit code ${exitCode}`);
} finally {
  await rm(root, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
}
