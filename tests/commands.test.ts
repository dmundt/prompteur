import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { activate } from '../src/extension';
import { decodeYaml, encodeYaml, newPrompt } from '../src/core/documents';
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
      'prompteur.copyPrompt',
      'prompteur.duplicate',
      'prompteur.preview',
      'prompteur.edit',
      'prompteur.delete',
    ]);
    expect(promptMenu).toContainEqual(
      expect.objectContaining({ command: 'prompteur.copy', group: 'inline@1' }),
    );
    expect(manifest.contributes.menus['view/item/context']).toContainEqual(
      expect.objectContaining({
        command: 'prompteur.pastePrompt',
        when: expect.stringContaining('viewItem =~ /^(scope|category)$/'),
      }),
    );
    expect(manifest.contributes.menus['view/item/context']).toContainEqual(
      expect.objectContaining({
        command: 'prompteur.migrateCategories',
        when: 'view == prompteur.prompts && viewItem == scope',
      }),
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
    const category: TreeNode = { kind: 'category', scope: 'user', category: 'review' };
    await run('newPrompt', category);
    await run('newPrompt', category);
    expect((await entries()).map((node) => node.entry.path).sort()).toEqual([
      'prompts/code-review-2.prompt.yaml',
      'prompts/code-review.prompt.yaml',
    ]);
    const node = (await entries())[0]!;
    expect(node.entry.data.category).toBe('review');
    await run('duplicate', node);
    expect(await entries()).toHaveLength(3);
    await run('edit', node);
    expect(window.activeTextEditor!.document.uri.fsPath).toBe(join(userRoot(), node.entry.path));
    expect(messages.errors).toEqual([]);
  });
  it('requires a category choice when creating from a scope', async () => {
    const showInputBox = vi.spyOn(window, 'showInputBox');
    responses.quick.push(null);
    responses.input.push('Cancelled');
    await run('newPrompt', scopeNode('user'));
    expect(showInputBox).not.toHaveBeenCalled();
    expect(await entries('user')).toEqual([]);

    responses.quick.push('Review');
    responses.input.push('Categorized');
    await run('newPrompt', scopeNode('user'));
    expect((await entries('user'))[0]?.entry.data.category).toBe('review');
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
  it('copies prompt records across scopes and categories without using the OS clipboard', async () => {
    const data = {
      ...newPrompt('Shared Prompt'),
      description: 'Reusable description',
      category: 'review' as const,
      tags: ['security', 'quality'],
      content: 'Review this source',
    };
    const source = `# Preserve this note\n${encodeYaml(data)}`;
    const sourcePath = join(userRoot(), 'prompts', 'source.yaml');
    await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(sourcePath, source);
    const occupiedPath = join(workspaceRoot(), 'prompts', 'shared-prompt.prompt.yaml');
    await fs.mkdir(join(workspaceRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(occupiedPath, encodeYaml(newPrompt('Occupied')));
    await run('refresh');

    const sourceNode = (await entries('user')).find((node) => node.entry.data.name === data.name)!;
    env.clipboard.value = 'Leave OS clipboard unchanged';
    await run('copyPrompt', sourceNode);
    expect(env.clipboard.value).toBe('Leave OS clipboard unchanged');

    const target: TreeNode = { kind: 'category', scope: 'workspace', category: 'plan' };
    workspace.isTrusted = false;
    await expect(run('pastePrompt', target)).rejects.toThrow('Trust');
    await expect(
      fs.access(join(workspaceRoot(), 'prompts', 'shared-prompt-2.prompt.yaml')),
    ).rejects.toThrow();

    workspace.isTrusted = true;
    await run('pastePrompt', target);
    const workspaceCopyPath = join(workspaceRoot(), 'prompts', 'shared-prompt-2.prompt.yaml');
    expect(decodeYaml(await fs.readFile(workspaceCopyPath, 'utf8'))).toEqual({
      ...data,
      category: 'plan',
    });
    expect(await fs.readFile(workspaceCopyPath, 'utf8')).toContain('# Preserve this note');
    expect(await fs.readFile(sourcePath, 'utf8')).toBe(source);
    expect(window.activeTextEditor!.document.uri.fsPath).toBe(workspaceCopyPath);

    await run('pastePrompt', scopeNode('user'));
    const userCopy = (await entries('user')).find(
      (node) => node.entry.data.name === data.name && node.entry.path !== 'prompts/source.yaml',
    );
    expect(userCopy?.entry.data.category).toBe('review');
  });
  it('requires trusted Workspace source copy and reports paste without a buffer', async () => {
    await run('pastePrompt', scopeNode('user'));
    expect(messages.info.at(-1)).toContain('Copy a prompt');

    const data = {
      ...newPrompt('Workspace Source'),
      category: 'debug' as const,
      content: 'Source',
    };
    const path = join(workspaceRoot(), 'prompts', 'workspace-source.yaml');
    await fs.mkdir(join(workspaceRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(path, encodeYaml(data));
    await run('refresh');
    const source = (await entries('workspace')).find((node) => node.entry.data.name === data.name)!;
    workspace.isTrusted = false;
    await expect(run('copyPrompt', source)).rejects.toThrow('Trust');

    workspace.isTrusted = true;
    await run('copyPrompt', source);
    await fs.writeFile(path, encodeYaml({ ...newPrompt('Changed'), category: 'review' }));
    await run('refresh');
    workspace.isTrusted = false;
    await run('pastePrompt', scopeNode('user'));
    const userCopy = (await entries('user')).find((node) => node.entry.data.name === data.name);
    expect(userCopy?.entry.data).toMatchObject(data);
    expect(await fs.readFile(path, 'utf8')).toContain('name: Changed');
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
  it('enforces trust before workspace copy/preview or writes, while User prompts remain usable', async () => {
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
    const source =
      '# preserve ordering\ncontent: "safe"\nname: native\nversion: 1\ncategory: review\n';
    document.change(source);
    await saveDocument(document);
    expect(await fs.readFile(document.uri.fsPath, 'utf8')).toBe(source);
    document.change('version: 1\nname: Native\ncontent: "{{selection}}"\ncategory: review\n');
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
  it('uses User and Workspace labels in the scope picker', async () => {
    const showQuickPick = vi.spyOn(window, 'showQuickPick');
    responses.quick.push('User');
    responses.input.push('User prompt');
    await run('newPrompt');
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { label: 'User', value: 'user' },
        { label: 'Workspace', value: 'workspace' },
      ],
      { title: 'Choose library' },
    );
    expect((await entries()).some((item) => item.entry.data.name === 'User prompt')).toBe(true);
  });
  it('requires one of the seven canonical categories when creating at scope level', async () => {
    const showQuickPick = vi.spyOn(window, 'showQuickPick');
    responses.quick.push('Debug');
    responses.input.push('Triage');
    await run('newPrompt', scopeNode('user'));
    expect(showQuickPick).toHaveBeenCalledWith(
      [
        { label: 'Explain', value: 'explain' },
        { label: 'Plan', value: 'plan' },
        { label: 'Implement', value: 'implement' },
        { label: 'Review', value: 'review' },
        { label: 'Test', value: 'test' },
        { label: 'Debug', value: 'debug' },
        { label: 'Document', value: 'document' },
      ],
      { title: 'Choose category' },
    );
    expect((await entries('user'))[0]?.entry.data.category).toBe('debug');
  });
  it('creates nothing when category selection is cancelled', async () => {
    const showInputBox = vi.spyOn(window, 'showInputBox');
    responses.quick.push(null);
    await run('newPrompt', scopeNode('user'));
    expect(showInputBox).not.toHaveBeenCalled();
    expect(await entries('user')).toEqual([]);
  });
  it('rejects creation from a stale noncanonical category node', async () => {
    const category: TreeNode = { kind: 'category', scope: 'user', category: 'Legacy' };
    await expect(run('newPrompt', category)).rejects.toThrow('one of the seven');
    expect(await entries('user')).toEqual([]);
  });
  it('exposes category migration on library scope rows', async () => {
    const manifest = JSON.parse(await fs.readFile('package.json', 'utf8')) as {
      contributes: {
        commands: { command: string }[];
        menus: { 'view/item/context': { command: string; when: string; group: string }[] };
      };
    };
    expect(manifest.contributes.commands.map((command) => command.command)).toContain(
      'prompteur.migrateCategories',
    );
    expect(manifest.contributes.menus['view/item/context']).toContainEqual({
      command: 'prompteur.migrateCategories',
      when: 'view == prompteur.prompts && viewItem == scope',
      group: '4_manage',
    });
  });
  it('reviews legacy category mappings and asks for choices before migrating', async () => {
    const sourceByName = new Map([
      ['audit', 'version: 1\nname: Audit Prompt\ncategory: audit\ncontent: Audit\n'],
      ['case-variant', 'version: 1\nname: Case Variant\ncategory: REVIEW\ncontent: Review\n'],
      [
        'engineering',
        '# Keep this note\nversion: 1\nname: Engineering Prompt\ncategory: engineering\ncontent: Build\n',
      ],
      ['missing', 'version: 1\nname: Missing Category\ncontent: Explain\n'],
      ['misc', 'version: 1\nname: Misc Prompt\ncategory: misc\ncontent: General\n'],
    ]);
    await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
    for (const [name, source] of sourceByName)
      await fs.writeFile(join(userRoot(), 'prompts', `${name}.yaml`), source);
    await run('refresh');

    responses.quick.push('User', 'Implement', 'Test', 'Explain');
    responses.warning.push('Migrate');
    await run('migrateCategories');

    const migrated = await entries('user');
    const categoryByName = new Map(
      migrated.map((node) => [node.entry.data.name, node.entry.data.category]),
    );
    expect(categoryByName).toEqual(
      new Map([
        ['Audit Prompt', 'review'],
        ['Case Variant', 'review'],
        ['Engineering Prompt', 'implement'],
        ['Missing Category', 'explain'],
        ['Misc Prompt', 'test'],
      ]),
    );
    expect(
      (await tree().getChildren(scopeNode('user'))).filter((node) => node.kind === 'problem'),
    ).toEqual([]);
    expect(await fs.readFile(join(userRoot(), 'prompts', 'engineering.yaml'), 'utf8')).toContain(
      '# Keep this note',
    );
    expect(messages.warnings.at(-1)).toContain('audit -> review');
    expect(messages.info.at(-1)).toContain('Updated categories in 5 prompts');
  });
  it('does not rewrite categories when migration is cancelled and enforces Workspace Trust', async () => {
    const userSource = 'version: 1\nname: Audit\ncategory: audit\ncontent: Review\n';
    const userPath = join(userRoot(), 'prompts', 'audit.yaml');
    await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(userPath, userSource);
    await run('refresh');
    responses.quick.push('User');
    responses.warning.push(null);
    await run('migrateCategories');
    expect(await fs.readFile(userPath, 'utf8')).toBe(userSource);

    const workspaceSource = 'version: 1\nname: Workspace Audit\ncategory: audit\ncontent: Review\n';
    const workspacePath = join(workspaceRoot(), 'prompts', 'audit.yaml');
    await fs.mkdir(join(workspaceRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(workspacePath, workspaceSource);
    await run('refresh');
    workspace.isTrusted = false;
    responses.quick.push('Workspace');
    await expect(run('migrateCategories')).rejects.toThrow('Trust');
    expect(await fs.readFile(workspacePath, 'utf8')).toBe(workspaceSource);
  });
  it('leaves canonical and malformed prompts unchanged when nothing can be migrated', async () => {
    const canonical = encodeYaml(newPrompt('Canonical', 'plan'));
    const canonicalPath = join(userRoot(), 'prompts', 'canonical.yaml');
    const malformedPath = join(userRoot(), 'prompts', 'malformed.yaml');
    await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(canonicalPath, canonical);
    await fs.writeFile(malformedPath, 'version: [');
    await run('refresh');

    await run('migrateCategories', scopeNode('user'));

    expect(await fs.readFile(canonicalPath, 'utf8')).toBe(canonical);
    expect(await fs.readFile(malformedPath, 'utf8')).toBe('version: [');
    expect(messages.info.at(-1)).toContain('No prompt categories need migration');
  });
  it('cancels migration when user rejects per-prompt category choice', async () => {
    const source = 'version: 1\nname: Specialized\ncategory: engineering\ncontent: Build\n';
    const path = join(userRoot(), 'prompts', 'specialized.yaml');
    await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(path, source);
    await run('refresh');
    responses.quick.push(null);

    await run('migrateCategories', scopeNode('user'));

    expect(await fs.readFile(path, 'utf8')).toBe(source);
    expect(messages.warnings).toEqual([]);
  });
  it('truncates long migration mapping and path previews', async () => {
    const legacy = [
      ['audit', 'Audit', 'audit'],
      ['architecture', 'Architecture', 'architecture'],
      ['debugging', 'Debugging', 'debugging'],
      ['devops', 'DevOps', 'devops'],
      ['engineering', 'Engineering', 'engineering'],
      ['refactor', 'Refactor', 'refactor'],
      ['security', 'Security', 'security'],
    ] as const;
    await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
    for (const [file, name, category] of legacy)
      await fs.writeFile(
        join(userRoot(), 'prompts', `${file}.yaml`),
        `version: 1\nname: ${name}\ncategory: ${category}\ncontent: Review\n`,
      );
    await run('refresh');
    responses.quick.push('Implement');
    responses.warning.push(null);
    await run('migrateCategories', scopeNode('user'));

    expect(messages.warnings.at(-1)).toContain('1 more mappings');
    expect(messages.warnings.at(-1)).toContain('And 2 more prompts');
    expect(await entries('user')).toHaveLength(0);
  });
  it('blocks migration when affected prompt has unsaved editor changes', async () => {
    const source = 'version: 1\nname: Audit\ncategory: audit\ncontent: Review\n';
    const path = join(userRoot(), 'prompts', 'audit.yaml');
    await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(path, source);
    await run('refresh');
    const problem = (await tree().getChildren(scopeNode())).find(
      (node) => node.kind === 'problem',
    )!;
    await run('edit', problem);
    window.activeTextEditor!.document.change(`${source}# unsaved\n`);

    await expect(run('migrateCategories')).rejects.toThrow('Save or discard');
    expect(await fs.readFile(path, 'utf8')).toBe(source);
  });
  it('rejects source changes made during migration confirmation', async () => {
    const source = 'version: 1\nname: Audit\ncategory: audit\ncontent: Review\n';
    const external = 'version: 1\nname: External\ncategory: review\ncontent: New\n';
    const path = join(userRoot(), 'prompts', 'audit.yaml');
    await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(path, source);
    await run('refresh');
    vi.spyOn(window, 'showWarningMessage').mockImplementation(async () => {
      await fs.writeFile(path, external);
      return 'Migrate';
    });

    await expect(run('migrateCategories')).rejects.toThrow('stopped after 0 prompts');
    expect(await fs.readFile(path, 'utf8')).toBe(external);
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
    responses.input.push('User scoped prompt');
    await run('newPrompt');
    expect((await entries()).some((item) => item.entry.data.name === 'User scoped prompt')).toBe(
      true,
    );
  });
});
