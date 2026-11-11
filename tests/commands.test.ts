import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { activate } from '../src/extension';
import { encodeYaml, newPrompt } from '../src/core/documents';
import type { PromptTree, TreeNode } from '../src/workbench/tree';
import {
  collections,
  commands,
  env,
  FakeDocument,
  FakeEditor,
  FakeMemento,
  handlers,
  inputBoxes,
  messages,
  providers,
  reset,
  responses,
  saveDocument,
  Uri,
  views,
  window,
  workspace,
} from './vscode-mock';

let root: string;
let context: {
  extensionUri: Uri;
  globalStorageUri: Uri;
  globalStoragePath: string;
  globalState: FakeMemento;
  subscriptions: { dispose(): void }[];
};
const run = (name: string, node?: TreeNode) => commands.executeCommand(`prompteur.${name}`, node);
const userRoot = () => join(root, 'user', 'prompts');
const workspaceRoot = () => join(root, 'project', '.vscode', 'prompts');
const tree = () => views.get('prompteur.prompts')!.treeDataProvider as PromptTree;
const scopeNode = (scope: 'user' | 'workspace' = 'user'): TreeNode => ({ kind: 'scope', scope });
async function entries(scope: 'user' | 'workspace' = 'user') {
  const groups = await tree().getChildren(scopeNode(scope));
  return (
    await Promise.all(
      groups.filter((node) => node.kind === 'category').map((node) => tree().getChildren(node)),
    )
  )
    .flat()
    .filter((node) => node.kind === 'entry');
}
async function addPrompt(
  name = 'review',
  content = 'Review {{selection}} in {{filename}}',
  scope: 'user' | 'workspace' = 'user',
) {
  const base = scope === 'user' ? userRoot() : workspaceRoot();
  await fs.mkdir(join(base, 'prompts'), { recursive: true });
  await fs.writeFile(
    join(base, 'prompts', `${name}.yaml`),
    `# Authored note\n${encodeYaml({ ...newPrompt(name), content })}`,
  );
  await run('refresh');
  return (await entries(scope)).find((node) => node.entry.path === `prompts/${name}.yaml`)!;
}
async function destination(source = 'code') {
  const document = new FakeDocument(Uri.file(join(root, 'project', 'main.ts')), source);
  const editor = new FakeEditor(document);
  editor.selection.end = document.positionAt(source.length);
  editor.selections = [editor.selection];
  workspace.textDocuments.push(document);
  window.visibleTextEditors.push(editor);
  await window.showTextDocument(document);
  return editor;
}

beforeEach(async () => {
  reset();
  root = await fs.mkdtemp(join(tmpdir(), 'prompteur-commands-'));
  await fs.mkdir(join(root, 'project'), { recursive: true });
  workspace.workspaceFolders = [{ uri: Uri.file(join(root, 'project')), name: 'project' }];
  context = {
    extensionUri: Uri.file(resolve('.')),
    globalStorageUri: Uri.file(join(root, 'user')),
    globalStoragePath: join(root, 'user'),
    globalState: new FakeMemento(),
    subscriptions: [],
  };
  await activate(context as unknown as vscode.ExtensionContext);
});
afterEach(async () => {
  for (const disposable of context.subscriptions) disposable.dispose();
  vi.restoreAllMocks();
  await fs.rm(root, { force: true, recursive: true });
});

describe('release commands', () => {
  it('uses the local profile path when VS Code exposes a non-file storage URI', async () => {
    for (const disposable of context.subscriptions) disposable.dispose();
    context.subscriptions = [];
    context.globalStorageUri = Uri.parse('vscode-userdata:/profile/storage');
    await activate(context as unknown as vscode.ExtensionContext);
    await run('addStarters', scopeNode());
    expect(await entries()).toHaveLength(16);
  });
  it('exposes one view and no removed commands or persistent state mutations', async () => {
    context.globalState.values.set('usageMetadata', {
      version: 1,
      records: { legacy: 'preserve' },
    });
    const before = new Map(context.globalState.values);
    expect([...views.keys()]).toEqual(['prompteur.prompts']);
    for (const command of [
      'favorite',
      'sort',
      'settings',
      'newFolder',
      'newRule',
      'import',
      'export',
      'insert',
    ])
      expect(handlers.has(`prompteur.${command}`)).toBe(false);
    const manifest = JSON.parse(await fs.readFile('package.json', 'utf8')) as {
      contributes: {
        commands: { command: string; title: string }[];
        menus: { 'view/item/context': { command: string; when: string; group: string }[] };
      };
    };
    expect([...handlers.keys()].sort()).toEqual(
      manifest.contributes.commands.map((item) => item.command).sort(),
    );
    expect(manifest.contributes).not.toHaveProperty('keybindings');
    const promptMenu = manifest.contributes.menus['view/item/context'].filter(
      (item) =>
        item.when.includes('viewItem == prompt') ||
        item.when.includes('viewItem =~ /^(prompt|problem)$/'),
    );
    expect(
      promptMenu.filter((item) => item.group !== 'inline@1').map((item) => item.command),
    ).toEqual([
      'prompteur.copy',
      'prompteur.duplicate',
      'prompteur.preview',
      'prompteur.edit',
      'prompteur.delete',
    ]);
    expect(promptMenu).toContainEqual(
      expect.objectContaining({ command: 'prompteur.copy', group: 'inline@1' }),
    );
    expect(
      manifest.contributes.commands
        .filter((item) =>
          ['prompteur.copy', 'prompteur.duplicate', 'prompteur.preview', 'prompteur.edit'].includes(
            item.command,
          ),
        )
        .map((item) => [item.command, item.title]),
    ).toEqual([
      ['prompteur.edit', 'Edit'],
      ['prompteur.duplicate', 'Duplicate'],
      ['prompteur.copy', 'Copy'],
      ['prompteur.preview', 'Preview'],
    ]);
    const node = await addPrompt('plain', 'Plain');
    await run('copy', node);
    await run('preview', node);
    expect(context.globalState.values).toEqual(before);
    expect(providers.size).toBe(0);
  });
  it('creates readable names, suffixes collisions, inherits categories, duplicates and edits', async () => {
    responses.input.push('Code review', 'Code review');
    const category: TreeNode = { kind: 'category', scope: 'user', category: 'engineering' };
    await run('newPrompt', category);
    await run('newPrompt', category);
    expect((await entries()).map((node) => node.entry.path).sort()).toEqual([
      'prompts/code-review-2.prompt.yaml',
      'prompts/code-review.prompt.yaml',
    ]);
    const node = (await entries())[0]!;
    expect(node.entry.data.category).toBe('engineering');
    await run('duplicate', node);
    expect(await entries()).toHaveLength(3);
    await run('edit', node);
    expect(window.activeTextEditor!.document.uri.fsPath).toBe(join(userRoot(), node.entry.path));
    expect(messages.errors).toEqual([]);
  });
  it('ignores old settings and preserves existing starter files, even invalid ones', async () => {
    const bundled = resolve('resources/starter/prompts/code-review.yaml');
    const original = await fs.readFile(bundled, 'utf8');
    await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(
      join(userRoot(), 'settings.yaml'),
      'version: 1\ndefaultPromptFolder: templates\n',
    );
    await fs.writeFile(join(userRoot(), 'prompts', 'code-review.yaml'), 'invalid user file');
    await run('addStarters', scopeNode());
    expect(await entries()).toHaveLength(15);
    expect(await fs.readFile(join(userRoot(), 'prompts', 'code-review.yaml'), 'utf8')).toBe(
      'invalid user file',
    );
    await run('addStarters', scopeNode());
    expect(messages.info.at(-1)).toContain('Added 0');
    expect(await fs.readFile(bundled, 'utf8')).toBe(original);
    expect(await fs.readFile(join(userRoot(), 'settings.yaml'), 'utf8')).toContain('templates');
  });
  it('installs sixteen starters as ordinary files without changing bundled source', async () => {
    await run('addStarters', scopeNode());
    expect(await entries()).toHaveLength(16);
    const node = (await entries()).find((item) => item.entry.path.endsWith('code-review.yaml'))!;
    expect(await fs.readFile(join(userRoot(), node.entry.path), 'utf8')).toBe(
      await fs.readFile(resolve('resources/starter/prompts/code-review.yaml'), 'utf8'),
    );
    await destination();
    await run('copy', node);
    expect(env.clipboard.value).toContain('Inspect this change');
  });
  it('copies retained editor selections without changing source or persistent state', async () => {
    const node = await addPrompt();
    const target = await destination();
    await run('edit', node);
    await run('copy', node);
    expect(env.clipboard.value).toBe('Review code in main.ts');
    expect(target.document.getText()).toBe('code');
    const plain = await addPrompt('plain', '{{clipboard}} {{workspace}}');
    env.clipboard.value = '{{selection}}';
    await run('copy', plain);
    expect(env.clipboard.value).toBe('{{selection}} project');
    expect(context.globalState.values.size).toBe(0);
  });
  it('allows empty selections for copy and preview without warnings', async () => {
    const node = await addPrompt('optional', 'Audit workspace: {{selection}}');
    await run('copy', node);
    expect(env.clipboard.value).toBe('Audit workspace: ');
    await run('preview', node);
    expect(window.activeTextEditor!.document.getText()).toBe('Audit workspace: ');
    const target = await destination('');
    await run('copy', node);
    expect(env.clipboard.value).toBe('Audit workspace: ');
    expect(target.document.getText()).toBe('');
    expect(messages.warnings).toEqual([]);
  });
  it('warns for other empty values, honors cancellation and reports unsupported variables', async () => {
    const node = await addPrompt('empty', '{{clipboard}}');
    responses.warning.push(null);
    await run('copy', node);
    expect(env.clipboard.value).toBe('');
    expect(messages.warnings.at(-1)).toContain('clipboard');
    const invalid = await addPrompt('invalid', '{{not-supported}}');
    await expect(run('copy', invalid)).rejects.toThrow('Unsupported');
    expect(messages.errors.at(-1)).toContain('Unsupported');
  });
  it('uses independent plaintext preview snapshots without redirecting later copy', async () => {
    const node = await addPrompt(
      'preview',
      '![img](https://example.invalid/{{clipboard}}) {{selection}}',
    );
    const target = await destination('original');
    env.clipboard.value = 'CANARY';
    await run('preview', node);
    const first = window.activeTextEditor!.document;
    expect(first.languageId).toBe('plaintext');
    expect(first.uri.scheme).toBe('untitled');
    expect(first.getText()).toContain('CANARY) original');
    env.clipboard.value = 'NEW';
    await run('preview', node);
    const second = window.activeTextEditor!.document;
    expect(second).not.toBe(first);
    expect(first.getText()).toContain('CANARY');
    expect(second.getText()).toContain('NEW) original');
    await run('copy', node);
    expect(env.clipboard.value).toContain('NEW) original');
    expect(target.document.getText()).toBe('original');
    expect(second.getText()).toContain('NEW) original');
  });
  it('enforces trust before workspace copy/preview or writes, while personal prompts remain usable', async () => {
    const node = await addPrompt('workspace', '{{clipboard}}', 'workspace');
    const personal = await addPrompt('personal', 'safe');
    workspace.isTrusted = false;
    const read = vi.spyOn(env.clipboard, 'readText');
    for (const command of ['copy', 'preview'])
      await expect(run(command, node)).rejects.toThrow('Trust');
    expect(read).not.toHaveBeenCalled();
    responses.input.push('Blocked');
    await expect(run('newPrompt', scopeNode('workspace'))).rejects.toThrow('Trust');
    responses.warning.push('Delete');
    await expect(run('delete', node)).rejects.toThrow('Trust');
    await run('copy', personal);
    expect(env.clipboard.value).toBe('safe');
  });
  it('validates dirty buffers but never formats user saves', async () => {
    const node = await addPrompt('native', 'safe');
    await run('edit', node);
    const document = window.activeTextEditor!.document;
    const source = '# preserve ordering\ncontent: "safe"\nname: native\nversion: 1\n';
    document.change(source);
    await saveDocument(document);
    expect(await fs.readFile(document.uri.fsPath, 'utf8')).toBe(source);
    document.change('version: 1\nname: Native\ncontent: "{{selection}}"\n');
    await run('copy', node);
    expect(window.activeTextEditor!.decorations).toHaveLength(1);
    document.change('version: [');
    await expect(run('copy', node)).rejects.toThrow();
    expect(collections[0]!.get(document.uri.toString())?.length).toBe(1);
  });
  it('live filters exact tags and clears the main tree filter', async () => {
    await addPrompt('review', 'review');
    await run('search');
    const box = inputBoxes[0]!;
    box.valueChanged.fire('nonexistent');
    expect(await entries()).toHaveLength(0);
    box.accepted.fire();
    await run('clearSearch');
    expect(await entries()).toHaveLength(1);
  });
  it('confirms deletion, blocks dirty editors and rejects stale nodes', async () => {
    const node = await addPrompt('delete', 'safe');
    responses.warning.push(null);
    await run('delete', node);
    expect(await entries()).toHaveLength(1);
    await run('edit', node);
    window.activeTextEditor!.document.change('dirty');
    await expect(run('delete', node)).rejects.toThrow();
    window.activeTextEditor!.document.change(node.entry.source);
    window.activeTextEditor!.document.isDirty = false;
    responses.warning.push('Delete');
    await run('delete', node);
    expect(await entries()).toHaveLength(0);
    await expect(run('copy', node)).rejects.toThrow('changed');
  });
  it('opens malformed YAML for repair and isolates unrelated broken files', async () => {
    const node = await addPrompt('valid', 'SAFE');
    const path = join(userRoot(), 'prompts', 'bad.yaml');
    await fs.writeFile(path, 'version: [');
    await run('refresh');
    await run('copy', node);
    expect(env.clipboard.value).toBe('SAFE');
    const problem = (await tree().getChildren(scopeNode())).find(
      (item) => item.kind === 'problem',
    )!;
    await run('edit', problem);
    expect(window.activeTextEditor!.document.uri.fsPath).toBe(path);
  });
  it('handles palette selection and cancellations without mutations', async () => {
    responses.quick.push(null);
    await run('newPrompt');
    responses.input.push(null, '   ');
    await run('newPrompt', scopeNode());
    await run('newPrompt', scopeNode());
    await addPrompt('plain', 'safe');
    responses.quick.push('plain');
    await run('copy');
    expect(env.clipboard.value).toBe('safe');
    responses.quick.push(null);
    await run('copy');
    workspace.workspaceFolders = [];
    for (const disposable of context.subscriptions) disposable.dispose();
    context.subscriptions = [];
    await activate(context as unknown as vscode.ExtensionContext);
    expect(await tree().getChildren()).toHaveLength(1);
    responses.input.push('Personal');
    await run('newPrompt');
    expect((await entries()).some((item) => item.entry.data.name === 'Personal')).toBe(true);
  });
});
