import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { activate } from '../src/extension';
import { decodeMarkdown, encodeMarkdown, newPrompt } from '../src/core/documents';
import type { PromptTree, TreeNode } from '../src/workbench/tree';
import {
  collections,
  commands,
  commandExecutions,
  configurationChanged,
  env,
  FakeDocument,
  FakeEditor,
  FakeMemento,
  handlers,
  inputBoxes,
  MarkdownString,
  messages,
  providers,
  quickPicks,
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
    join(base, 'prompts', `${name}.prompt.md`),
    encodeMarkdown({ ...newPrompt(name), content }).replace('---\n', '---\n# Authored note\n'),
  );
  await run('refresh');
  return (await entries(scope)).find((node) => node.entry.path === `prompts/${name}.prompt.md`)!;
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
      'migrateCategories',
    ])
      expect(handlers.has(`prompteur.${command}`)).toBe(false);
    const manifest = JSON.parse(await fs.readFile('package.json', 'utf8')) as {
      contributes: {
        commands: { command: string; title: string }[];
        configuration: { properties: Record<string, unknown> };
        menus: {
          'view/item/context': { command: string; when: string; group: string }[];
          'view/title': { command: string; when: string; group: string }[];
        };
      };
    };
    expect([...handlers.keys()].sort()).toEqual(
      [
        ...manifest.contributes.commands.map((item) => item.command),
        'prompteur.filterFromTooltip',
        'prompteur.openPromptPath',
      ].sort(),
    );
    expect(manifest.contributes).not.toHaveProperty('keybindings');
    expect(manifest.contributes.menus['view/title']).toContainEqual({
      command: 'prompteur.openSettings',
      when: 'view == prompteur.prompts',
      group: 'navigation@4',
    });
    expect(manifest.contributes.configuration).toMatchObject({
      properties: {
        'prompteur.defaultScope': {
          type: 'string',
          default: 'ask',
          enum: ['ask', 'user', 'workspace'],
        },
        'prompteur.preferredCategory': { type: 'string', default: '' },
        'prompteur.showTags': { type: 'boolean', default: true },
        'prompteur.categoryCountMode': {
          type: 'string',
          enum: ['filtered', 'total', 'hidden'],
          default: 'filtered',
        },
      },
    });
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
    expect(manifest.contributes.commands.map((item) => item.command)).not.toContain(
      'prompteur.migrateCategories',
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
    await run('openSettings');
    expect(commandExecutions.at(-1)).toEqual({
      id: 'workbench.action.openSettings',
      args: ['@ext:dmundt.prompteur'],
    });
  });
  it('creates readable names, suffixes collisions, inherits categories, duplicates and edits', async () => {
    responses.input.push('Code review', 'Code review');
    const category: TreeNode = { kind: 'category', scope: 'user', category: 'review' };
    await run('newPrompt', category);
    await run('newPrompt', category);
    expect((await entries()).map((node) => node.entry.path).sort()).toEqual([
      'prompts/code-review-2.prompt.md',
      'prompts/code-review.prompt.md',
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
    const bundled = resolve('resources/starter/prompts/code-review.prompt.md');
    const original = await fs.readFile(bundled, 'utf8');
    await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(
      join(userRoot(), 'settings.yaml'),
      'version: 1\ndefaultPromptFolder: templates\n',
    );
    await fs.writeFile(
      join(userRoot(), 'prompts', 'code-review.yaml'),
      'legacy YAML stays untouched',
    );
    await run('addStarters', scopeNode());
    expect(await entries()).toHaveLength(16);
    expect(await fs.readFile(join(userRoot(), 'prompts', 'code-review.yaml'), 'utf8')).toBe(
      'legacy YAML stays untouched',
    );
    await run('addStarters', scopeNode());
    expect(messages.info.at(-1)).toContain('Added 0');
    expect(await fs.readFile(bundled, 'utf8')).toBe(original);
    expect(await fs.readFile(join(userRoot(), 'settings.yaml'), 'utf8')).toContain('templates');
  });
  it('installs sixteen starters as ordinary files without changing bundled source', async () => {
    await run('addStarters', scopeNode());
    expect(await entries()).toHaveLength(16);
    const node = (await entries()).find((item) =>
      item.entry.path.endsWith('code-review.prompt.md'),
    )!;
    expect(await fs.readFile(join(userRoot(), node.entry.path), 'utf8')).toBe(
      await fs.readFile(resolve('resources/starter/prompts/code-review.prompt.md'), 'utf8'),
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
    const source = encodeMarkdown(data).replace('---\n', '---\n# Preserve this note\n');
    const sourcePath = join(userRoot(), 'prompts', 'source.prompt.md');
    await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(sourcePath, source);
    const occupiedPath = join(workspaceRoot(), 'prompts', 'shared-prompt.prompt.md');
    await fs.mkdir(join(workspaceRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(occupiedPath, encodeMarkdown(newPrompt('Occupied')));
    await run('refresh');

    const sourceNode = (await entries('user')).find((node) => node.entry.data.name === data.name)!;
    env.clipboard.value = 'Leave OS clipboard unchanged';
    await run('copyPrompt', sourceNode);
    expect(env.clipboard.value).toBe('Leave OS clipboard unchanged');

    const target: TreeNode = { kind: 'category', scope: 'workspace', category: 'plan' };
    workspace.isTrusted = false;
    await expect(run('pastePrompt', target)).rejects.toThrow('Trust');
    await expect(
      fs.access(join(workspaceRoot(), 'prompts', 'shared-prompt-2.prompt.md')),
    ).rejects.toThrow();

    workspace.isTrusted = true;
    await run('pastePrompt', target);
    const workspaceCopyPath = join(workspaceRoot(), 'prompts', 'shared-prompt-2.prompt.md');
    expect(decodeMarkdown(await fs.readFile(workspaceCopyPath, 'utf8'))).toEqual({
      ...data,
      category: 'plan',
    });
    expect(await fs.readFile(workspaceCopyPath, 'utf8')).toContain('# Preserve this note');
    expect(await fs.readFile(sourcePath, 'utf8')).toBe(source);
    expect(window.activeTextEditor!.document.uri.fsPath).toBe(workspaceCopyPath);

    await run('pastePrompt', scopeNode('user'));
    const userCopy = (await entries('user')).find(
      (node) =>
        node.entry.data.name === data.name && node.entry.path !== 'prompts/source.prompt.md',
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
    const path = join(workspaceRoot(), 'prompts', 'workspace-source.prompt.md');
    await fs.mkdir(join(workspaceRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(path, encodeMarkdown(data));
    await run('refresh');
    const source = (await entries('workspace')).find((node) => node.entry.data.name === data.name)!;
    workspace.isTrusted = false;
    await expect(run('copyPrompt', source)).rejects.toThrow('Trust');

    workspace.isTrusted = true;
    await run('copyPrompt', source);
    await fs.writeFile(path, encodeMarkdown({ ...newPrompt('Changed'), category: 'review' }));
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
      '---\n# preserve ordering\nname: native\nversion: 1\ncategory: review\n---\nsafe';
    document.change(source);
    await saveDocument(document);
    expect(await fs.readFile(document.uri.fsPath, 'utf8')).toBe(source);
    document.change(
      '---\nversion: 1\nname: Native\ndescription: "{{unsupported}}"\ncategory: review\n---\n{{selection}}',
    );
    await run('copy', node);
    expect(window.activeTextEditor!.decorations).toHaveLength(1);
    expect(window.activeTextEditor!.decorations[0]!.start.line).toBe(6);
    document.change('---\nversion: [\n---\n');
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
  it('appends tooltip filters to the open search and opens validated prompt paths', async () => {
    const userPrompt = await addPrompt('tooltip-user', 'needle');
    const workspacePrompt = await addPrompt('tooltip-workspace', 'safe', 'workspace');
    await run('search');
    const box = inputBoxes.at(-1)!;
    box.valueChanged.fire('needle');
    await commands.executeCommand('prompteur.filterFromTooltip', 'tag', 'security review');
    expect(tree().query).toBe('needle tag:"security review"');
    expect(box.value).toBe(tree().query);
    await commands.executeCommand('prompteur.filterFromTooltip', 'category', 'explain');
    expect(tree().query).toBe('needle tag:"security review" category:"explain"');
    await commands.executeCommand('prompteur.filterFromTooltip', 'category', 'explain');
    expect(tree().query).toBe('needle tag:"security review" category:"explain"');

    await commands.executeCommand('prompteur.openPromptPath', 'user', userPrompt.entry.path);
    expect(window.activeTextEditor!.document.uri.fsPath).toBe(
      join(userRoot(), userPrompt.entry.path),
    );
    workspace.isTrusted = false;
    await commands.executeCommand(
      'prompteur.openPromptPath',
      'workspace',
      workspacePrompt.entry.path,
    );
    expect(window.activeTextEditor!.document.uri.fsPath).toBe(
      join(workspaceRoot(), workspacePrompt.entry.path),
    );
    await expect(
      commands.executeCommand('prompteur.openPromptPath', 'user', '../outside.yaml'),
    ).rejects.toThrow('changed or became invalid');
    await commands.executeCommand('prompteur.clearSearch');
    expect(box.value).toBe('');
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
  it('opens malformed Markdown frontmatter for repair and isolates unrelated broken files', async () => {
    const node = await addPrompt('valid', 'SAFE');
    const path = join(userRoot(), 'prompts', 'bad.prompt.md');
    await fs.writeFile(path, '---\nversion: [\n---\n');
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
  it('uses configured defaults for untargeted writes and preserves explicit targets', async () => {
    const showQuickPick = vi.spyOn(window, 'showQuickPick');
    workspace.configuration.set('prompteur.defaultScope', 'user');
    responses.quick.push('Review');
    responses.input.push('Default User Prompt');
    await run('newPrompt');
    expect(showQuickPick).not.toHaveBeenCalled();
    expect(
      (await entries('user')).some((node) => node.entry.data.name === 'Default User Prompt'),
    ).toBe(true);

    workspace.configuration.set('prompteur.defaultScope', 'workspace');
    responses.quick.push('Test');
    responses.input.push('Default Workspace Prompt');
    await run('newPrompt');
    expect(
      (await entries('workspace')).some(
        (node) => node.entry.data.name === 'Default Workspace Prompt',
      ),
    ).toBe(true);

    responses.quick.push('Plan');
    responses.input.push('Explicit User Prompt');
    await run('newPrompt', scopeNode('user'));
    expect(
      (await entries('user')).some((node) => node.entry.data.name === 'Explicit User Prompt'),
    ).toBe(true);
  });
  it('uses the default for starters and paste, but never falls back from unavailable Workspace', async () => {
    workspace.configuration.set('prompteur.defaultScope', 'workspace');
    await run('addStarters');
    expect(await entries('workspace')).toHaveLength(16);
    expect(await entries('user')).toHaveLength(0);

    const source = await addPrompt('default-paste', 'Copied');
    await run('copyPrompt', source);
    await run('pastePrompt');
    expect(
      (await entries('workspace')).some((node) => node.entry.data.name === 'default-paste'),
    ).toBe(true);

    workspace.isTrusted = false;
    responses.quick.push('Review');
    responses.input.push('Untrusted Workspace Prompt');
    await expect(run('newPrompt')).rejects.toThrow('Trust');
    expect(await entries('workspace')).toHaveLength(17);

    for (const disposable of context.subscriptions.splice(0)) disposable.dispose();
    workspace.workspaceFolders = [];
    await activate(context as unknown as vscode.ExtensionContext);
    await expect(run('addStarters')).rejects.toThrow('Workspace library is unavailable');
    expect(await entries('user')).toHaveLength(1);
    expect((await entries('user'))[0]?.entry.data.name).toBe('default-paste');
  });
  it('offers built-in categories and category approval when creating at scope level', async () => {
    const showQuickPick = vi.spyOn(window, 'showQuickPick');
    responses.quick.push('Debug');
    responses.input.push('Triage');
    await run('newPrompt', scopeNode('user'));
    expect(showQuickPick).not.toHaveBeenCalled();
    expect(quickPicks.at(-1)?.items).toEqual([
      { label: 'Explain', value: 'explain' },
      { label: 'Plan', value: 'plan' },
      { label: 'Implement', value: 'implement' },
      { label: 'Review', value: 'review' },
      { label: 'Test', value: 'test' },
      { label: 'Debug', value: 'debug' },
      { label: 'Document', value: 'document' },
      { label: '$(add) Add Category...', value: '__add_category__' },
    ]);
    expect((await entries('user'))[0]?.entry.data.category).toBe('debug');
  });
  it('preselects an approved category without forcing that choice', async () => {
    workspace.configuration.set('prompteur.preferredCategory', ' REVIEW ');
    responses.quick.push('Plan');
    responses.input.push('Chosen Category');
    await run('newPrompt', scopeNode('user'));
    expect(quickPicks.at(-1)?.activeItems.map((item) => item.value)).toEqual(['review']);
    expect((await entries('user'))[0]?.entry.data.category).toBe('plan');

    workspace.configuration.set('prompteur.preferredCategory', 'not-approved');
    responses.quick.push('Debug');
    responses.input.push('Unmatched Preference');
    await run('newPrompt', scopeNode('user'));
    expect(quickPicks.at(-1)?.activeItems).toEqual([]);
    expect(
      (await entries('user')).find((node) => node.entry.data.name === 'Unmatched Preference')?.entry
        .data.category,
    ).toBe('debug');
  });
  it('shows prompt tags by default and refreshes row descriptions when hidden', async () => {
    const node = await addPrompt('tag-visibility', 'safe');
    await fs.writeFile(
      join(userRoot(), node.entry.path),
      encodeMarkdown({ ...node.entry.data, tags: ['security', 'quality'] }),
    );
    await run('refresh');
    const taggedNode = (await entries()).find((item) => item.entry.data.name === 'tag-visibility')!;
    expect(tree().getTreeItem(taggedNode).description).toBe('#security #quality');

    const refresh = vi.spyOn(tree(), 'refresh');
    workspace.configuration.set('prompteur.showTags', false);
    configurationChanged.fire({
      affectsConfiguration: (section) => section === 'prompteur.showTags',
    });
    expect(refresh).toHaveBeenCalled();
    expect(tree().getTreeItem(taggedNode).description).toBeUndefined();
    expect((tree().getTreeItem(taggedNode).tooltip as MarkdownString).value).toContain('#security');

    workspace.configuration.set('prompteur.showTags', true);
    configurationChanged.fire({
      affectsConfiguration: (section) => section === 'prompteur.showTags',
    });
    expect(tree().getTreeItem(taggedNode).description).toBe('#security #quality');

    const previousRefreshCount = refresh.mock.calls.length;
    workspace.configuration.set('prompteur.categoryCountMode', 'total');
    configurationChanged.fire({
      affectsConfiguration: (section) => section === 'prompteur.categoryCountMode',
    });
    expect(refresh).toHaveBeenCalledTimes(previousRefreshCount + 1);
  });
  it('requires confirmation to add a profile category and shares it across libraries', async () => {
    responses.quick.push('$(add) Add Category...');
    responses.input.push('Research', 'User Research Prompt');
    responses.warning.push('Add Category');
    await run('newPrompt', scopeNode('user'));
    expect(context.globalState.values.get('approvedPromptCategories')).toEqual(['research']);
    expect((await entries('user'))[0]?.entry.data.category).toBe('research');

    for (const disposable of context.subscriptions.splice(0)) disposable.dispose();
    await activate(context as unknown as vscode.ExtensionContext);
    responses.quick.push('Research');
    responses.input.push('Workspace Research Prompt');
    await run('newPrompt', scopeNode('workspace'));
    expect((await entries('workspace'))[0]?.entry.data.category).toBe('research');
  });
  it('loads only valid non-built-in categories from profile state', async () => {
    for (const disposable of context.subscriptions.splice(0)) disposable.dispose();
    context.globalState.values.set('approvedPromptCategories', [
      ' Review ',
      'Research',
      null,
      42,
      '',
    ]);
    await activate(context as unknown as vscode.ExtensionContext);
    workspace.configuration.set('prompteur.preferredCategory', ' Research ');
    responses.quick.push('Research');
    responses.input.push('Research prompt');
    await run('newPrompt', scopeNode('user'));
    const choices = quickPicks.at(-1)?.items ?? [];
    expect(choices.map((choice) => choice.label)).toContain('Research');
    expect(choices.filter((choice) => choice.label === 'Review')).toHaveLength(1);
    expect(quickPicks.at(-1)?.activeItems.map((item) => item.value)).toEqual(['research']);
    expect((await entries('user'))[0]?.entry.data.category).toBe('research');
  });
  it('removes an unused approved category from the picker without creating a prompt', async () => {
    for (const disposable of context.subscriptions.splice(0)) disposable.dispose();
    context.globalState.values.set('approvedPromptCategories', ['research']);
    await activate(context as unknown as vscode.ExtensionContext);
    responses.quick.push('$(remove) Remove Category...', 'Research');
    responses.warning.push('Remove Category');

    await run('newPrompt', scopeNode('user'));

    expect(quickPicks[0]?.items.map((item) => item.value)).toContain('__remove_category__');
    expect(context.globalState.values.get('approvedPromptCategories')).toEqual([]);
    expect(await entries('user')).toEqual([]);
  });
  it('reports an empty state when no custom categories are approved', async () => {
    const showQuickPick = vi.spyOn(window, 'showQuickPick');
    await run('removeCategory');
    expect(messages.info.at(-1)).toContain('No approved custom categories');
    expect(context.globalState.values.has('approvedPromptCategories')).toBe(false);
    expect(showQuickPick).not.toHaveBeenCalled();
  });
  it('cancels approved-category removal without changing profile state', async () => {
    for (const disposable of context.subscriptions.splice(0)) disposable.dispose();
    context.globalState.values.set('approvedPromptCategories', ['research']);
    await activate(context as unknown as vscode.ExtensionContext);
    responses.quick.push('Research');
    responses.warning.push(null);

    await run('removeCategory');

    expect(context.globalState.values.get('approvedPromptCategories')).toEqual(['research']);
  });
  it('blocks approved-category removal while valid prompts use it', async () => {
    for (const disposable of context.subscriptions.splice(0)) disposable.dispose();
    context.globalState.values.set('approvedPromptCategories', ['research']);
    await activate(context as unknown as vscode.ExtensionContext);
    await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
    await fs.writeFile(
      join(userRoot(), 'prompts', 'research.prompt.md'),
      '---\nversion: 1\nname: Research\ncategory: research\n---\nBody',
    );
    await run('refresh');
    responses.quick.push('Research');

    await expect(run('removeCategory')).rejects.toThrow('1 prompt uses it. Reassign them first.');

    await fs.writeFile(
      join(userRoot(), 'prompts', 'research-notes.prompt.md'),
      '---\nversion: 1\nname: Research Notes\ncategory: research\n---\nNotes',
    );
    await run('refresh');
    responses.quick.push('Research');
    await expect(run('removeCategory')).rejects.toThrow('2 prompts use it. Reassign them first.');
    expect(context.globalState.values.get('approvedPromptCategories')).toEqual(['research']);
    expect((await entries('user')).every((node) => node.entry.data.category === 'research')).toBe(
      true,
    );
  });
  it('does not add or create a category when approval is cancelled', async () => {
    responses.quick.push('$(add) Add Category...');
    responses.input.push('Temporary');
    responses.warning.push(null);
    await run('newPrompt', scopeNode('user'));
    expect(context.globalState.values.has('approvedPromptCategories')).toBe(false);
    expect(await entries('user')).toEqual([]);
  });
  it('validates added category names for emptiness, length, reserved values, and duplicates', async () => {
    responses.quick.push('$(add) Add Category...');
    responses.input.push('Research', 'Research Prompt');
    responses.warning.push('Add Category');
    const showInputBox = vi.spyOn(window, 'showInputBox');
    await run('newPrompt', scopeNode('user'));

    const validate = showInputBox.mock.calls[0]?.[0]?.validateInput;
    expect(validate?.('')).toBe('Category name is required');
    expect(validate?.('x'.repeat(65))).toBe('Category name must be 64 characters or fewer');
    expect(validate?.('__add_category__')).toBe('Category is already approved');
    expect(validate?.('Another Category')).toBeUndefined();

    responses.quick.push('$(add) Add Category...');
    responses.input.push('research');
    responses.warning.push(null);
    await run('newPrompt', scopeNode('user'));
    expect(showInputBox.mock.calls[2]?.[0]?.validateInput?.('research')).toBe(
      'Category is already approved',
    );
    expect(context.globalState.values.get('approvedPromptCategories')).toEqual(['research']);
  });
  it('creates nothing when category selection is cancelled', async () => {
    const showInputBox = vi.spyOn(window, 'showInputBox');
    responses.quick.push(null);
    await run('newPrompt', scopeNode('user'));
    expect(showInputBox).not.toHaveBeenCalled();
    expect(await entries('user')).toEqual([]);
  });
  it('rejects creation from a stale unapproved category node', async () => {
    const category: TreeNode = { kind: 'category', scope: 'user', category: 'Legacy' };
    await expect(run('newPrompt', category)).rejects.toThrow('approved prompt category');
    expect(await entries('user')).toEqual([]);
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
