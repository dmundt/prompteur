import { spawn } from 'node:child_process';
import process from 'node:process';
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';

const root = await realpath(await mkdtemp(join(tmpdir(), 'prompteur-host-')));
const workspace = join(root, 'sample-project');
const workspacePrompts = join(workspace, '.vscode', 'prompts', 'prompts');
await mkdir(workspacePrompts, { recursive: true });
await writeFile(
  join(workspacePrompts, 'review.prompt.md'),
  '---\nversion: 1\nname: Review\ncategory: review\n---\nReview {{selection}} in {{filename}}\n',
);
await writeFile(
  join(workspacePrompts, 'review-match.prompt.md'),
  '---\nversion: 1\nname: Review Match\ncategory: review\n---\nneedle\n',
);
await writeFile(
  join(workspacePrompts, 'plan.prompt.md'),
  '---\nversion: 1\nname: Plan\ncategory: plan\n---\nother\n',
);
await writeFile(
  join(workspacePrompts, 'research.prompt.md'),
  '---\nversion: 1\nname: Research\ncategory: research\n---\nneedle\n',
);
await writeFile(join(workspacePrompts, 'invalid.prompt.md'), '---\nversion: [\n---\n');
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
  const userPrompts = join(
    profile,
    'User',
    'globalStorage',
    'dmundt.prompteur',
    'prompts',
    'prompts',
  );
  await mkdir(userPrompts, { recursive: true });
  await writeFile(
    join(profile, 'User', 'settings.json'),
    JSON.stringify({
      'security.workspace.trust.enabled': true,
      'security.workspace.trust.startupPrompt': 'never',
      'prompteur.categoryCountMode': 'filtered',
      'prompteur.groupByCategory': true,
    }),
  );
  await writeFile(
    join(userPrompts, 'review-one.prompt.md'),
    '---\nversion: 1\nname: Review One\ncategory: review\n---\nneedle\n',
  );
  await writeFile(
    join(userPrompts, 'review-two.prompt.md'),
    '---\nversion: 1\nname: Review Two\ncategory: review\n---\nother\n',
  );
  await writeFile(
    join(userPrompts, 'plan.prompt.md'),
    '---\nversion: 1\nname: Plan\ncategory: plan\n---\nother\n',
  );
  await writeFile(
    join(userPrompts, 'research.prompt.md'),
    '---\nversion: 1\nname: Research\ncategory: research\n---\nneedle\n',
  );
  await writeFile(join(userPrompts, 'invalid.prompt.md'), '---\nversion: [\n---\n');
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
