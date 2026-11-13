import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { LibraryService } from '../src/application/library';
import { PromptTree, type TreeNode } from '../src/workbench/tree';
import { watchLibrary } from '../src/workbench/watch';
import { MarkdownString, TreeItemCollapsibleState, Uri, watchers } from './vscode-mock';
import { encodeMarkdown, newPrompt } from '../src/core/documents';
import { memoryFiles } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  watchers.splice(0);
});
describe('native tree interactions', () => {
  it('tracks parent paths for native TreeView reveal', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/one.prompt.md', encodeMarkdown(newPrompt('One')));
    const tree = new PromptTree(new LibraryService(port), () => false, vi.fn());
    const root = (await tree.getChildren())[0]!;
    const scope = (await tree.getChildren(root))[0]!;
    const category = (await tree.getChildren(scope))[0]!;
    const entry = (await tree.getChildren(category))[0]!;

    expect(tree.getParent(root)).toBeUndefined();
    expect(tree.getParent(scope)).toEqual(root);
    expect(tree.getParent(category)).toEqual(scope);
    expect(tree.getParent(entry)).toEqual(category);
    tree.dispose();
  });

  it('escapes scope folder labels and passes only scope to the reveal command', () => {
    const { port } = memoryFiles();
    const root = Uri.file('C:\\Library [shared]\\prompts');
    const tree = new PromptTree(
      new LibraryService(port),
      () => false,
      vi.fn(),
      undefined,
      undefined,
      undefined,
      () => root,
    );
    const tooltip = tree.getTreeItem({ kind: 'scope', scope: 'user' }).tooltip as MarkdownString;
    expect(tooltip.value).toContain('\\[shared\\]');
    expect(tooltip.value).toContain(
      `](command:prompteur.openLibraryFolder?${encodeURIComponent(JSON.stringify(['user']))})`,
    );
    expect(tooltip.isTrusted).toEqual({ enabledCommands: ['prompteur.openLibraryFolder'] });
    expect(port.list).not.toHaveBeenCalled();
    expect(port.read).not.toHaveBeenCalled();
    tree.dispose();
  });
  it('shows scope and category help without reading library data', () => {
    const { port } = memoryFiles();
    const tree = new PromptTree(new LibraryService(port), () => true, vi.fn());
    const user = tree.getTreeItem({ kind: 'scope', scope: 'user' });
    const workspace = tree.getTreeItem({ kind: 'scope', scope: 'workspace' });
    expect((user.tooltip as MarkdownString).value).toBe(
      'Prompts stored in this VS Code profile; optional VS Code Settings Sync.',
    );
    expect((workspace.tooltip as MarkdownString).value).toBe(
      'Prompts stored in the first workspace folder; writes, generation, and preview require Workspace Trust.',
    );
    expect(user).toMatchObject({ label: 'User', id: 'user', contextValue: 'scope' });
    expect(workspace).toMatchObject({
      label: 'Workspace',
      id: 'workspace',
      contextValue: 'scope',
    });

    const descriptions = [
      ['explain', 'Understand code, behavior, and changes.'],
      ['plan', 'Define requirements, scope, and implementation steps.'],
      ['implement', 'Make scoped code changes.'],
      ['review', 'Assess code, architecture, security, and readiness.'],
      ['test', 'Design or add tests.'],
      ['debug', 'Diagnose failures and investigate causes.'],
      ['document', 'Write or improve documentation.'],
    ] as const;
    for (const [category, description] of descriptions) {
      expect(tree.getTreeItem({ kind: 'category', scope: 'user', category }).tooltip).toBe(
        description,
      );
    }
    const mixedCase = tree.getTreeItem({
      kind: 'category',
      scope: 'workspace',
      category: 'ReViEw',
      filteredCount: 2,
    });
    expect(mixedCase).toMatchObject({
      label: 'ReViEw (2)',
      id: 'workspace:category:review',
      contextValue: 'category',
      tooltip: 'Assess code, architecture, security, and readiness.',
    });
    for (const category of ['Custom', '__proto__', 'constructor']) {
      expect(tree.getTreeItem({ kind: 'category', scope: 'user', category }).tooltip).toBe(
        'User-defined category for organizing prompts.',
      );
    }
    expect(port.list).not.toHaveBeenCalled();
    expect(port.read).not.toHaveBeenCalled();
    tree.dispose();
  });
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
    const top = await tree.getChildren();
    expect(top).toEqual([{ kind: 'root' }]);
    expect(tree.getTreeItem(top[0]!)).toMatchObject({
      label: 'Prompts',
      id: 'prompts',
      collapsibleState: TreeItemCollapsibleState.Expanded,
    });
    const roots = await tree.getChildren(top[0]);
    expect(roots).toHaveLength(2);
    expect(tree.getTreeItem(roots[0]!).label).toBe('User');
    expect(tree.getTreeItem(roots[0]!).iconPath).toBeUndefined();
    expect(tree.getTreeItem(roots[1]!).iconPath).toBeUndefined();
    const children = await tree.getChildren(roots[0]);
    expect(children.map((node) => node.kind)).toEqual(['category', 'problem']);
    expect(tree.getTreeItem(children[0]!).contextValue).toBe('category');
    expect(tree.getTreeItem(children[0]!).description).toBeUndefined();
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
    expect(tooltip.value).toBe(
      [
        '**Review**',
        '**Description** · Review overview',
        '**Scope** · User',
        `**Category** · [review](command:prompteur.filterFromTooltip?${encodeURIComponent(JSON.stringify(['category', 'review']))})`,
        `**Tags** · [#security](command:prompteur.filterFromTooltip?${encodeURIComponent(JSON.stringify(['tag', 'security']))})`,
        `**Path** · [prompts/review/a.prompt.md](command:prompteur.openPromptPath?${encodeURIComponent(JSON.stringify(['user', 'prompts/review/a.prompt.md']))})`,
      ].join('  \n'),
    );
    expect(tooltip.value).not.toContain('Copy Text:');
    expect(tooltip.value).not.toContain('Copy Prompt:');
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
  it('shows workspace scope and omits empty optional hover rows', async () => {
    const { port, files } = memoryFiles();
    files.set('workspace:prompts/example.prompt.md', encodeMarkdown(newPrompt('Example [safe]')));
    const tree = new PromptTree(new LibraryService(port), () => true, vi.fn());
    const category = (await tree.getChildren({ kind: 'scope', scope: 'workspace' }))[0]!;
    const entry = (await tree.getChildren(category))[0]!;
    const tooltip = tree.getTreeItem(entry).tooltip as MarkdownString;

    expect(tooltip.value).toBe(
      [
        '**Example \\[safe\\]**',
        '**Scope** · Workspace',
        `**Category** · [explain](command:prompteur.filterFromTooltip?${encodeURIComponent(JSON.stringify(['category', 'explain']))})`,
        `**Path** · [prompts/example.prompt.md](command:prompteur.openPromptPath?${encodeURIComponent(JSON.stringify(['workspace', 'prompts/example.prompt.md']))})`,
      ].join('  \n'),
    );
    tree.dispose();
  });
  it('keeps multiline prompt metadata compact and escapes Markdown', async () => {
    const { port, files } = memoryFiles();
    files.set(
      'user:prompts/example.prompt.md',
      encodeMarkdown({
        ...newPrompt('First\nSecond'),
        description: 'First line\n[unsafe](command:evil.run)',
      }),
    );
    const tree = new PromptTree(new LibraryService(port), () => false, vi.fn());
    const category = (await tree.getChildren({ kind: 'scope', scope: 'user' }))[0]!;
    const entry = (await tree.getChildren(category))[0]!;
    const tooltip = tree.getTreeItem(entry).tooltip as MarkdownString;

    expect(tooltip.value).toContain(
      '**First Second**  \n**Description** · First line \\[unsafe\\](command:evil.run)',
    );
    expect(tooltip.value).not.toContain('\n\n');
    expect(tooltip.isTrusted).toEqual({
      enabledCommands: ['prompteur.filterFromTooltip', 'prompteur.openPromptPath'],
    });
    tree.dispose();
  });
  it('shows an actionable empty state only when an active filter has no valid matches', async () => {
    const { port, files } = memoryFiles();
    files.set(
      'user:prompts/found.prompt.md',
      encodeMarkdown({ ...newPrompt('Found'), category: 'review' }),
    );
    files.set('user:prompts/bad.prompt.md', '---\nversion: [\n---\n');
    const report = vi.fn();
    const scope: TreeNode = { kind: 'scope', scope: 'user' };
    const tree = new PromptTree(new LibraryService(port), () => false, report);

    tree.query = 'missing';
    const noMatches = await tree.getChildren(scope);
    expect(noMatches.map((node) => node.kind)).toEqual(['empty', 'problem']);
    expect(tree.getTreeItem(noMatches[0]!)).toMatchObject({
      label: 'No valid prompts match this filter.',
      tooltip: 'No valid prompts match this filter.\nSelect to clear filter',
      contextValue: 'emptyState',
      command: { command: 'prompteur.clearSearch', title: 'Clear Filter' },
    });
    expect(tree.getTreeItem(noMatches[0]!).description).toBeUndefined();

    tree.query = '';
    const unfiltered = await tree.getChildren(scope);
    expect(unfiltered.map((node) => node.kind)).toEqual(['category', 'problem']);
    const category = unfiltered.find((node) => node.kind === 'category')!;
    tree.query = 'missing';
    expect(await tree.getChildren(category)).toEqual([{ kind: 'empty', scope: 'user' }]);

    const flatTree = new PromptTree(
      new LibraryService(port),
      () => false,
      report,
      undefined,
      undefined,
      () => false,
    );
    flatTree.query = 'missing';
    expect((await flatTree.getChildren(scope)).map((node) => node.kind)).toEqual([
      'empty',
      'problem',
    ]);

    const { port: failingPort } = memoryFiles();
    vi.spyOn(failingPort, 'list').mockRejectedValue(new Error('Library unavailable'));
    const failingTree = new PromptTree(new LibraryService(failingPort), () => false, report);
    failingTree.query = 'missing';
    expect(await failingTree.getChildren(scope)).toEqual([]);
    expect(report).toHaveBeenCalledWith('Library unavailable');

    tree.dispose();
    flatTree.dispose();
    failingTree.dispose();
  });
  it('shows distinct saved prompt context in hover without reading values', async () => {
    const { port, files } = memoryFiles();
    const contents = [
      ['context', '{{filename}} {{selection}} {{filename}} {{ clipboard }} {{workspace}} {{text}}'],
      ['none', 'No placeholders'],
      ['invalid', '{{selection}} {{unknown}}'],
      ['unbalanced', '{{selection'],
    ] as const;
    for (const [name, content] of contents)
      files.set(`user:prompts/${name}.prompt.md`, encodeMarkdown({ ...newPrompt(name), content }));
    const report = vi.fn();
    const service = new LibraryService(port);
    const tree = new PromptTree(service, () => false, report);
    const categories = await tree.getChildren({ kind: 'scope', scope: 'user' });
    const entries = await tree.getChildren(categories[0]!);
    const hover = (name: string) => {
      const entry = entries.find((node) => node.kind === 'entry' && node.entry.data.name === name);
      expect(entry).toBeDefined();
      return (tree.getTreeItem(entry!).tooltip as MarkdownString).value;
    };

    expect(hover('context')).toContain(
      '**Context** · Filename, Selection, Clipboard, Workspace, Text',
    );
    expect(hover('none')).not.toContain('**Context');
    expect(hover('invalid')).toContain('**Context unavailable** · Unsupported variable: unknown');
    expect(hover('unbalanced')).toContain('**Context unavailable** · Unbalanced variable braces');
    files.set(
      'user:prompts/context.prompt.md',
      encodeMarkdown({ ...newPrompt('context'), content: '{{workspace}}' }),
    );
    await service.refresh('user', 'prompts/context.prompt.md');
    const refreshed = await tree.getChildren(categories[0]!);
    const updated = refreshed.find(
      (node) => node.kind === 'entry' && node.entry.data.name === 'context',
    );
    expect(updated).toBeDefined();
    expect((tree.getTreeItem(updated!).tooltip as MarkdownString).value).toContain(
      '**Context** · Workspace',
    );
    expect(report).not.toHaveBeenCalled();
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
  it('does not traverse the whole snapshot for category or flat prompt rows', async () => {
    const { port, files } = memoryFiles();
    files.set(
      'user:prompts/review.prompt.md',
      encodeMarkdown({ ...newPrompt('Review'), category: 'review' }),
    );
    const service = new LibraryService(port);
    const snapshot = await service.get('user');
    vi.spyOn(service, 'get').mockResolvedValue({
      ...snapshot,
      get entries(): typeof snapshot.entries {
        throw new Error('Unneeded whole-library traversal');
      },
    });
    const report = vi.fn();
    const tree = new PromptTree(
      service,
      () => false,
      report,
      undefined,
      undefined,
      () => false,
    );
    const category = await tree.getChildren({
      kind: 'category',
      scope: 'user',
      category: 'review',
    });
    const flat = await tree.getChildren({ kind: 'scope', scope: 'user' });
    expect(category.map((node) => tree.getTreeItem(node).label)).toEqual(['Review']);
    expect(flat.map((node) => tree.getTreeItem(node).label)).toEqual(['Review']);
    expect(report).not.toHaveBeenCalled();
    tree.dispose();
  });
  it('batches flat prompt rows without hiding repair problems', async () => {
    const { port, files } = memoryFiles();
    for (let index = 0; index < 201; index++)
      files.set(`user:prompts/${index}.prompt.md`, encodeMarkdown(newPrompt(String(index))));
    files.set('user:prompts/bad.prompt.md', '---\nversion: [\n---\n');
    const tree = new PromptTree(
      new LibraryService(port),
      () => false,
      vi.fn(),
      () => true,
      () => 'filtered',
      () => false,
    );

    const batches = await tree.getChildren({ kind: 'scope', scope: 'user' });
    expect(batches.map((node) => tree.getTreeItem(node).label)).toEqual(['1-200', '201-202']);
    const lastBatch = await tree.getChildren(batches[1]!);
    expect(lastBatch.map((node) => node.kind)).toContain('problem');
    expect(lastBatch.filter((node) => node.kind === 'entry')).toHaveLength(1);
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
