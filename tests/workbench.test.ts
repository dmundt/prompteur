import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { LibraryService } from '../src/application/library';
import { PromptTree, type TreeNode } from '../src/workbench/tree';
import { watchLibrary } from '../src/workbench/watch';
import { MarkdownString, Uri, watchers } from './vscode-mock';
import { encodeMarkdown, newPrompt } from '../src/core/documents';
import { memoryFiles } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  watchers.splice(0);
});
describe('native tree interactions', () => {
  it('groups prompts by category, ignores old rule files, filters and repairs Markdown prompts', async () => {
    const { port, files } = memoryFiles();
    files.set(
      'user:prompts/review/a.prompt.md',
      encodeMarkdown({
        ...newPrompt('Review'),
        category: 'review',
        description: 'Review overview',
        tags: ['security'],
      }),
    );
    files.set('user:rules/r.yaml', 'version: 1\nname: Rule\nenabled: false\ncontent: Hi\n');
    files.set('user:prompts/bad.prompt.md', '---\nversion: [\n---\n');
    const service = new LibraryService(port);
    const report = vi.fn();
    const tree = new PromptTree(service, () => true, report);
    const changed = vi.fn();
    tree.onDidChangeTreeData(changed);
    const roots = await tree.getChildren();
    expect(roots).toHaveLength(2);
    expect(tree.getTreeItem(roots[0]!).label).toBe('User');
    expect(tree.getTreeItem(roots[0]!).iconPath).toMatchObject({ id: 'person' });
    expect(tree.getTreeItem(roots[1]!).iconPath).toMatchObject({ id: 'root-folder' });
    const children = await tree.getChildren(roots[0]);
    expect(children.map((node) => node.kind)).toEqual(['category', 'problem']);
    expect(tree.getTreeItem(children[0]!).contextValue).toBe('category');
    expect(tree.getTreeItem(children[0]!).label).toBe('Review (1)');
    expect(tree.getTreeItem(children[1]!).contextValue).toBe('problem');
    expect(tree.getTreeItem(children[0]!).iconPath).toBeUndefined();
    expect(tree.getTreeItem(children[1]!).iconPath).toMatchObject({ id: 'warning' });
    const prompts = await tree.getChildren(children[0]);
    expect(tree.getTreeItem(prompts[0]!).contextValue).toBe('prompt');
    expect(tree.getTreeItem(prompts[0]!).iconPath).toBeUndefined();
    expect(prompts[0]!.kind === 'entry' && prompts[0]!.entry.data.category).toBe('review');
    expect(tree.getTreeItem(prompts[0]!).description).toBe('#security');
    const tooltip = tree.getTreeItem(prompts[0]!).tooltip as MarkdownString;
    expect(tooltip.value).toContain('Review overview');
    expect(tooltip.value).toContain('[review](command:prompteur.filterFromTooltip?');
    expect(tooltip.value).toContain('[#security](command:prompteur.filterFromTooltip?');
    expect(tooltip.value).toContain(
      '[prompts/review/a.prompt.md](command:prompteur.openPromptPath?',
    );
    expect(tooltip.isTrusted).toEqual({
      enabledCommands: ['prompteur.filterFromTooltip', 'prompteur.openPromptPath'],
    });
    expect(await tree.getChildren(prompts[0])).toEqual([]);
    tree.query = 'Review';
    expect(await tree.getChildren(roots[0])).toHaveLength(2);
    tree.query = '';
    await service.refresh('user');
    expect(changed).toHaveBeenCalled();
    expect((await service.get('user')).entries).toHaveLength(1);
    tree.dispose();
  });
  it('lazily batches large category groups', async () => {
    const { port, files } = memoryFiles();
    for (let index = 0; index < 201; index++)
      files.set(`user:prompts/${index}.prompt.md`, encodeMarkdown(newPrompt(String(index))));
    const report = vi.fn();
    const tree = new PromptTree(new LibraryService(port), () => false, report);
    const root: TreeNode = { kind: 'scope', scope: 'user' };
    const categories = await tree.getChildren(root);
    expect(categories).toHaveLength(1);
    const batches = await tree.getChildren(categories[0]!);
    expect(batches).toHaveLength(2);
    expect(tree.getTreeItem(batches[0]!).label).toBe('1-200');
    const children = await tree.getChildren(batches[0]);
    expect(children).toHaveLength(200);
    vi.mocked(port.list).mockRejectedValueOnce(new Error('Disk unavailable'));
    expect(await tree.getChildren({ kind: 'scope', scope: 'workspace' })).toEqual([]);
    tree.dispose();
  });
  it('lists prompts directly when category grouping is disabled', async () => {
    const { port, files } = memoryFiles();
    files.set(
      'user:prompts/review.prompt.md',
      encodeMarkdown({ ...newPrompt('Review'), category: 'review' }),
    );
    files.set(
      'user:prompts/plan.prompt.md',
      encodeMarkdown({ ...newPrompt('Plan'), category: 'plan' }),
    );
    const tree = new PromptTree(
      new LibraryService(port),
      () => false,
      vi.fn(),
      () => true,
      () => 'filtered',
      () => false,
    );

    const children = await tree.getChildren({ kind: 'scope', scope: 'user' });
    expect(children.map((node) => node.kind)).toEqual(['entry', 'entry']);
    expect(children.map((node) => tree.getTreeItem(node).label)).toEqual(['Plan', 'Review']);
    tree.dispose();
  });
  it('shows filtered, total, or hidden category counts without changing category filtering', async () => {
    const { port, files } = memoryFiles();
    files.set(
      'user:prompts/review-one.prompt.md',
      encodeMarkdown({ ...newPrompt('Review One'), category: 'review', content: 'needle' }),
    );
    files.set(
      'user:prompts/review-two.prompt.md',
      encodeMarkdown({ ...newPrompt('Review Two'), category: 'review', content: 'other' }),
    );
    files.set(
      'user:prompts/plan.prompt.md',
      encodeMarkdown({ ...newPrompt('Plan'), category: 'plan', content: 'needle' }),
    );
    let countMode: 'filtered' | 'total' | 'hidden' = 'filtered';
    const tree = new PromptTree(
      new LibraryService(port),
      () => false,
      vi.fn(),
      () => true,
      () => countMode,
    );
    const scope: TreeNode = { kind: 'scope', scope: 'user' };
    const labels = (nodes: TreeNode[]) => nodes.map((node) => tree.getTreeItem(node).label);

    expect(labels(await tree.getChildren(scope))).toEqual(['Plan (1)', 'Review (2)']);
    tree.query = 'needle';
    const filteredNodes = await tree.getChildren(scope);
    expect(labels(filteredNodes)).toEqual(['Plan (1)', 'Review (1)']);
    countMode = 'total';
    expect(labels(filteredNodes)).toEqual(['Plan (1)', 'Review (2)']);
    countMode = 'hidden';
    expect(labels(filteredNodes)).toEqual(['Plan', 'Review']);
    expect(
      await tree.getChildren({ kind: 'category', scope: 'user', category: 'review' }),
    ).toHaveLength(1);
    tree.dispose();
  });
  it('escapes tag labels in trusted prompt tooltip links', async () => {
    const { port, files } = memoryFiles();
    const unsafeTag = 'security](command:evil.run)';
    files.set(
      'user:prompts/a.prompt.md',
      encodeMarkdown({ ...newPrompt('Safe label'), tags: [unsafeTag] }),
    );
    const tree = new PromptTree(new LibraryService(port), () => false, vi.fn());
    const scope: TreeNode = { kind: 'scope', scope: 'user' };
    const category = (await tree.getChildren(scope))[0]!;
    const prompt = (await tree.getChildren(category))[0]!;
    const tooltip = tree.getTreeItem(prompt).tooltip as MarkdownString;

    expect(tooltip.value).toContain('\\]');
    expect(tooltip.isTrusted).toEqual({
      enabledCommands: ['prompteur.filterFromTooltip', 'prompteur.openPromptPath'],
    });
    expect(tooltip.value).not.toContain('command:evil.run?');
    tree.dispose();
  });
});

describe('VS Code file watcher integration', () => {
  it('debounces changes, incrementally reloads files, reloads structure and disposes', async () => {
    vi.useFakeTimers();
    const { port } = memoryFiles();
    const service = new LibraryService(port);
    await service.get('user');
    const refresh = vi.spyOn(service, 'refreshMany');
    const report = vi.fn();
    const watcher = watchLibrary(
      new Uri('/library') as unknown as vscode.Uri,
      'user',
      service,
      report,
    );
    const emitter = watchers[0]!;
    emitter.change.fire(new Uri('/library/prompts/a.prompt.md'));
    emitter.change.fire(new Uri('/library/prompts/a.prompt.md'));
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('user', ['prompts/a.prompt.md']);
    emitter.create.fire(new Uri('/library/prompts/new'));
    emitter.delete.fire(new Uri('/library/prompts/old'));
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenLastCalledWith('user', undefined);
    emitter.change.fire(new Uri('/library/a.lock'));
    emitter.change.fire(new Uri('/library/a.tmp'));
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(2);
    refresh.mockRejectedValueOnce(new Error('Failure'));
    emitter.change.fire(new Uri('/library/prompts/b.prompt.md'));
    await vi.runAllTimersAsync();
    expect(report).toHaveBeenCalled();
    emitter.change.fire(new Uri('/library/prompts/c.prompt.md'));
    watcher.dispose();
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});
