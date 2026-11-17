import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function prepareWorkspace(workspace) {
  const prompts = join(workspace, '.vscode', 'prompts', 'prompts');
  await mkdir(prompts, { recursive: true });
  await writeFile(
    join(prompts, 'review.prompt.md'),
    '---\nversion: 1\nname: UI Fixture Prompt\ncategory: review\n---\nTest prompt.\n',
  );
}

export async function exerciseWorkbench(page) {
  const activity = page.getByRole('tab', { name: /Prompteur/ });
  await activity.waitFor({ timeout: 30_000 });
  await activity.click();
  const category = page.getByRole('treeitem', { name: 'Review (1)' });
  await category.waitFor({ timeout: 30_000 });
  await category.click();
  await page.keyboard.press('ArrowRight');
  const prompt = page.getByRole('treeitem', { name: 'UI Fixture Prompt' });
  await prompt.waitFor({ timeout: 30_000 });
  await prompt.click();
  await page.getByRole('tab', { name: /review\.prompt\.md/ }).waitFor({ timeout: 30_000 });
}
