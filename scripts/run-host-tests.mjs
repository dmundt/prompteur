import { spawn } from 'node:child_process';
import process from 'node:process';
import { access, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

let executable = process.env.PROMPTEUR_CODE_PATH ?? process.env.VSCODE_EXECUTABLE_PATH;
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
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
executable ??= await downloadAndUnzipVSCode({
  version: process.env.VSCODE_TEST_VERSION ?? 'stable',
  cachePath: resolve('.vscode-test'),
});

async function runIntegration(restricted) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'prompteur-host-')));
  try {
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
    ];
    const extensionDevelopmentPath = resolve('.');
    const extensionTestsPath = resolve('dist/host-smoke.cjs');
    const extensionTestsEnv = { PROMPTEUR_TEST_RESTRICTED: restricted ? '1' : '0' };
    if (restricted) {
      const child = spawn(
        executable,
        [
          ...args,
          '--no-sandbox',
          '--disable-gpu-sandbox',
          '--skip-welcome',
          '--skip-release-notes',
          '--disable-updates',
          `--extensionTestsPath=${extensionTestsPath}`,
          `--extensionDevelopmentPath=${extensionDevelopmentPath}`,
        ],
        { env: { ...process.env, ...extensionTestsEnv }, stdio: 'inherit' },
      );
      await new Promise((resolveExit, reject) => {
        let timedOut = false;
        const timeout = setTimeout(() => {
          timedOut = true;
          child.kill();
        }, 120_000);
        child.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once('exit', (code) => {
          clearTimeout(timeout);
          if (timedOut) reject(new Error('Restricted Mode host timed out.'));
          else if (code === 0) resolveExit();
          else reject(new Error(`Restricted Mode host exited with ${code}.`));
        });
      });
    } else {
      await runTests({
        vscodeExecutablePath: executable,
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: args,
        extensionTestsEnv,
      });
    }
  } finally {
    await rm(root, { force: true, recursive: true, maxRetries: 10, retryDelay: 100 });
  }
}

await runIntegration(false);
await runIntegration(true);
