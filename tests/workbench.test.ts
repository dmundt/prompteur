import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { LibraryService } from '../src/application/library';
import { PromptTree, type TreeNode } from '../src/workbench/tree';
import { watchLibrary } from '../src/workbench/watch';
import { Uri, watchers } from './vscode-mock';
import { encodeYaml, newPrompt } from '../src/core/documents';
import { memoryFiles } from './helpers';

afterEach(() => {
  vi.useRealTimers();
  watchers.splice(0);
});
describe('native tree interactions', () => {
  it('groups prompts by category, ignores old rule files, filters and repairs YAML', async () => {
    const { port, files } = memoryFiles();
    files.set(
      'user:prompts/review/a.yaml',
      encodeYaml({ ...newPrompt('Review'), category: 'review', tags: ['security'] }),
    );
    files.set('user:rules/r.yaml', 'version: 1\nname: Rule\nenabled: false\ncontent: Hi\n');
    files.set('user:prompts/bad.yaml', 'version: [');
    const service = new LibraryService(port);
    const report = vi.fn();
    const tree = new PromptTree(service, () => true, report);
    const changed = vi.fn();
    tree.onDidChangeTreeData(changed);
    const roots = await tree.getChildren();
    expect(roots).toHaveLength(2);
    expect(tree.getTreeItem(roots[0]!).label).toBe('Personal');
    expect(tree.getTreeItem(roots[0]!).iconPath).toMatchObject({ id: 'account' });
    expect(tree.getTreeItem(roots[1]!).iconPath).toMatchObject({ id: 'root-folder' });
    const children = await tree.getChildren(roots[0]);
    expect(children.map((node) => node.kind)).toEqual(['category', 'problem']);
    expect(tree.getTreeItem(children[0]!).contextValue).toBe('category');
    expect(tree.getTreeItem(children[0]!).label).toBe('Review');
    expect(tree.getTreeItem(children[1]!).contextValue).toBe('problem');
    expect(tree.getTreeItem(children[0]!).iconPath).toBeUndefined();
    expect(tree.getTreeItem(children[1]!).iconPath).toMatchObject({ id: 'warning' });
    const prompts = await tree.getChildren(children[0]);
    expect(tree.getTreeItem(prompts[0]!).contextValue).toBe('prompt');
    expect(tree.getTreeItem(prompts[0]!).iconPath).toBeUndefined();
    expect(prompts[0]!.kind === 'entry' && prompts[0]!.entry.data.category).toBe('review');
    expect(tree.getTreeItem(prompts[0]!).description).toBe('#security');
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
      files.set(`user:prompts/${index}.yaml`, encodeYaml(newPrompt(String(index))));
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
    emitter.change.fire(new Uri('/library/prompts/a.yaml'));
    emitter.change.fire(new Uri('/library/prompts/a.yaml'));
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith('user', ['prompts/a.yaml']);
    emitter.create.fire(new Uri('/library/prompts/new'));
    emitter.delete.fire(new Uri('/library/prompts/old'));
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenLastCalledWith('user', undefined);
    emitter.change.fire(new Uri('/library/a.lock'));
    emitter.change.fire(new Uri('/library/a.tmp'));
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(2);
    refresh.mockRejectedValueOnce(new Error('Failure'));
    emitter.change.fire(new Uri('/library/prompts/b.yaml'));
    await vi.runAllTimersAsync();
    expect(report).toHaveBeenCalled();
    emitter.change.fire(new Uri('/library/prompts/c.yaml'));
    watcher.dispose();
    await vi.runAllTimersAsync();
    expect(refresh).toHaveBeenCalledTimes(3);
  });
});
