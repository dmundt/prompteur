import { spawn } from 'node:child_process';
import { access, mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { chromium } from 'playwright-core';
import { exerciseWorkbench, prepareWorkspace } from '../tests/ui/smoke.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const override = process.env[`${manifest.name.toUpperCase()}_CODE_PATH`];
let executable = override ?? process.env.VSCODE_EXECUTABLE_PATH;
if (!executable && !process.env.VSCODE_TEST_VERSION && process.platform === 'win32') {
  const installed = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe')
    : undefined;
  if (installed) {
    try {
      await access(installed);
      executable = installed;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}
executable ??= await downloadAndUnzipVSCode({
  version: process.env.VSCODE_TEST_VERSION ?? 'stable',
  cachePath: join(root, '.vscode-test'),
});

const temp = await mkdtemp(join(tmpdir(), `${manifest.name}-ui-`));
async function stopChild(child, exited) {
  if (child?.pid && child.exitCode === null && child.signalCode === null && !child.kill())
    throw new Error('Could not terminate the VS Code test process.');
  if (exited) {
    const waitForExit = async () => {
      const controller = new globalThis.AbortController();
      try {
        return await Promise.race([
          exited.then(() => true),
          delay(10_000, false, { signal: controller.signal }),
        ]);
      } finally {
        controller.abort();
      }
    };
    if (!(await waitForExit())) {
      child.kill('SIGKILL');
      if (!(await waitForExit()))
        throw new Error(`VS Code test process did not exit; temporary files remain at ${temp}.`);
    }
  }
}
let child;
let browser;
let exited;
const errors = [];
try {
  const workspace = join(temp, 'workspace');
  const profile = join(temp, 'profile');
  const home = join(temp, 'home');
  await mkdir(workspace, { recursive: true });
  await mkdir(home, { recursive: true });
  await prepareWorkspace(workspace);
  child = spawn(
    executable,
    [
      workspace,
      `--user-data-dir=${profile}`,
      `--extensions-dir=${join(temp, 'extensions')}`,
      `--extensionDevelopmentPath=${root}`,
      '--remote-debugging-address=127.0.0.1',
      '--remote-debugging-port=0',
      '--disable-extensions',
      '--disable-workspace-trust',
      '--disable-updates',
      '--new-window',
      '--skip-welcome',
      '--skip-release-notes',
      ...(process.platform === 'linux' && process.env.CI ? ['--no-sandbox'] : []),
    ],
    { stdio: 'inherit', env: { ...process.env, HOME: home, USERPROFILE: home } },
  );
  let spawnError;
  exited = new Promise((resolveExit) => {
    child.once('error', (error) => {
      spawnError = error;
      resolveExit();
    });
    child.once('exit', resolveExit);
  });
  let endpoint;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error('VS Code exited before opening its debugging endpoint.');
    try {
      const [port, path] = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8'))
        .trim()
        .split(/\r?\n/);
      if (!/^\d+$/.test(port ?? '') || !path?.startsWith('/'))
        throw new Error('VS Code returned an invalid debugging endpoint.');
      endpoint = `ws://127.0.0.1:${port}${path}`;
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await delay(250);
    }
  }
  if (!endpoint) throw new Error('VS Code did not publish its debugging endpoint.');
  browser = await chromium.connectOverCDP(endpoint);
  const context = browser.contexts()[0];
  if (!context) throw new Error('VS Code did not expose a workbench context.');
  let page;
  for (let attempt = 0; attempt < 120; attempt++) {
    page = context.pages().find((candidate) => candidate.url().includes('workbench'));
    if (page) break;
    await delay(250);
  }
  if (!page) throw new Error('VS Code workbench did not open.');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
  await exerciseWorkbench(page);
  if (child.exitCode !== null || child.signalCode !== null)
    throw new Error('VS Code exited during the interactive test.');
} catch (error) {
  errors.push(error);
} finally {
  try {
    if (browser) await browser.close();
  } catch (error) {
    errors.push(error);
  }
  try {
    await stopChild(child, exited);
    await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    errors.push(error);
  }
}
if (errors.length === 1) throw errors[0];
if (errors.length > 1) throw new globalThis.AggregateError(errors, 'UI test and cleanup failed.');
process.stdout.write('Interactive workbench test passed.\n');
