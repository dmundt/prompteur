import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { activate } from '../src/extension';
import type { PromptToolInput } from '../src/workbench/prompt-tool';
import { decodeMarkdown, encodeMarkdown, newPrompt } from '../src/core/documents';
import { LocalFiles } from '../src/platform/local-files';
import type { PromptTree, TreeNode } from '../src/workbench/tree';
import {
  collections,
  commands,
  commandExecutions,
  contextKeys,
  configurationChanged,
  CancellationError,
  Disposable,
  env,
  EventEmitter,
  FakeDocument,
  FakeEditor,
  FakeMemento,
  handlers,
  inputBoxes,
  languageModelTools,
  LanguageModelTextPart,
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
const noCancellation: vscode.CancellationToken = {
  isCancellationRequested: false,
  onCancellationRequested: () => new Disposable(),
};
const promptTool = () =>
  languageModelTools.get('prompteur_findPrompt') as vscode.LanguageModelTool<PromptToolInput>;
const runPromptTool = async (input: PromptToolInput) => {
  const result = await promptTool().invoke(
    { input, toolInvocationToken: undefined },
    noCancellation,
  );
  if (!result) throw new Error('Prompt tool returned no result');
  return result.content
    .filter((part): part is vscode.LanguageModelTextPart => part instanceof LanguageModelTextPart)
    .map((part) => part.value)
    .join('');
};
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
  root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'prompteur-commands-')));
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
    expect(await entries()).toHaveLength(18);
    await run('openUserLibrary');
    expect(commandExecutions.at(-1)).toEqual({
      id: 'revealFileInOS',
      args: [Uri.file(userRoot())],
    });
  });
  it('reveals only the User library root without requiring Workspace Trust', async () => {
    await addPrompt('existing');
    workspace.isTrusted = false;
    await run('openUserLibrary', scopeNode('workspace'));
    expect(commandExecutions.at(-1)).toEqual({
      id: 'revealFileInOS',
      args: [Uri.file(userRoot())],
    });
  });
  it('reports an unavailable User library without invoking the system file manager', async () => {
    await expect(run('openUserLibrary')).rejects.toThrow();
    expect(messages.errors.at(-1)).toContain(userRoot());
    expect(commandExecutions.some((item) => item.id === 'revealFileInOS')).toBe(false);
  });
  it('syncs User prompts through VS Code state and supports a flat tree', async () => {
    expect(context.globalState.syncedKeys).toEqual([
      'syncedUserPrompts',
      'approvedPromptCategories',
    ]);
    const remotePrompt = encodeMarkdown(newPrompt('Remote Sync'));
    await context.globalState.update('syncedUserPrompts', {
      version: 1,
      files: { 'prompts/remote-sync.prompt.md': remotePrompt },
      deleted: [],
    });
    for (const disposable of context.subscriptions.splice(0)) disposable.dispose();
    await activate(context as unknown as vscode.ExtensionContext);
    // Initial sync runs in the background so activation stays within its time budget.
    await vi.waitFor(async () => {
      expect(await fs.readFile(join(userRoot(), 'prompts', 'remote-sync.prompt.md'), 'utf8')).toBe(
        remotePrompt,
      );
      expect((await entries()).some((node) => node.entry.data.name === 'Remote Sync')).toBe(true);
    });

    await addPrompt('local-sync', 'local content');
    const synced = context.globalState.get<{ files: Record<string, string> }>('syncedUserPrompts')!;
    expect(synced.files['prompts/local-sync.prompt.md']).toContain('local content');

    workspace.configuration.set('prompteur.groupByCategory', false);
    configurationChanged.fire({
      affectsConfiguration: (section) => section === 'prompteur.groupByCategory',
    });
    const rows = await tree().getChildren(scopeNode('user'));
    expect(rows.every((node) => node.kind === 'entry')).toBe(true);
  });
  it('exposes one view and no removed commands or persistent state mutations', async () => {
    context.globalState.values.set('usageMetadata', {
      version: 1,
      records: { legacy: 'preserve' },
    });
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
      'sendToChat',
      'migrateCategories',
    ])
      expect(handlers.has(`prompteur.${command}`)).toBe(false);
    const manifest = JSON.parse(await fs.readFile('package.json', 'utf8')) as {
      activationEvents: string[];
      extensionDependencies?: string[];
      contributes: {
        commands: { command: string; title: string; enablement?: string; icon?: string }[];
        languageModelTools: {
          name: string;
          canBeReferencedInPrompt: boolean;
          inputSchema: { properties: Record<string, unknown>; oneOf: unknown[] };
        }[];
        configuration: { properties: Record<string, unknown> };
        menus: {
          commandPalette: { command: string; when: string }[];
          'editor/title': { command: string; when: string; group: string }[];
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
    expect(manifest.activationEvents).toContain('onLanguageModelTool:prompteur_findPrompt');
    expect(manifest.extensionDependencies).toBeUndefined();
    expect(manifest.contributes.languageModelTools).toHaveLength(1);
    expect(manifest.contributes.languageModelTools[0]).toMatchObject({
      name: 'prompteur_findPrompt',
      canBeReferencedInPrompt: true,
      inputSchema: {
        properties: {
          query: { type: 'string', minLength: 1, maxLength: 256 },
          scope: { type: 'string', enum: ['user', 'workspace'] },
          path: { type: 'string', minLength: 1 },
        },
        oneOf: [
          { required: ['query'], not: { required: ['path'] } },
          { required: ['scope', 'path'], not: { required: ['query'] } },
        ],
      },
    });
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
        'prompteur.groupByCategory': { type: 'boolean', default: true },
        'prompteur.search.matching': {
          enum: ['exact', 'fullText', 'fuzzy'],
          default: 'fullText',
          scope: 'window',
        },
        'prompteur.search.caseSensitive': { type: 'boolean', default: false },
        'prompteur.search.ranking': { enum: ['relevance', 'name'], default: 'relevance' },
        'prompteur.search.selection': {
          enum: ['bestMatch', 'requireChoice'],
          default: 'bestMatch',
        },
        'prompteur.syncUserPrompts': {
          type: 'boolean',
          default: true,
          scope: 'application',
        },
      },
    });
    const promptMenu = manifest.contributes.menus['view/item/context'].filter(
      (item) =>
        item.when.includes('viewItem == prompt') ||
        item.when.includes('viewItem =~ /^(prompt|problem)$/'),
    );
    expect(
      promptMenu.filter((item) => !item.group.startsWith('inline@')).map((item) => item.command),
    ).toEqual([
      'prompteur.copy',
      'prompteur.copyPrompt',
      'prompteur.preview',
      'prompteur.edit',
      'prompteur.delete',
    ]);
    expect(promptMenu.filter((item) => item.group.startsWith('inline@'))).toEqual([
      expect.objectContaining({ command: 'prompteur.copy', group: 'inline@1' }),
    ]);
    const contextItems = promptMenu.filter((item) => !item.group.startsWith('inline@'));
    expect(contextItems[0]?.group).toBe('0_text@1');
    expect(contextItems.slice(1).every((item) => item.group.split('@')[0] !== '0_text')).toBe(true);
    expect(manifest.contributes.menus.commandPalette).toEqual([
      { command: 'prompteur.duplicate', when: 'false' },
      { command: 'prompteur.searchActive', when: 'false' },
      { command: 'prompteur.useText', when: 'false' },
      { command: 'prompteur.cancelText', when: 'false' },
    ]);
    expect(manifest.contributes.menus['editor/title']).toEqual([
      {
        command: 'prompteur.useText',
        when: 'resourceScheme == untitled && resource in prompteur.textInputDocuments',
        group: 'navigation@1',
      },
      {
        command: 'prompteur.cancelText',
        when: 'resourceScheme == untitled && resource in prompteur.textInputDocuments',
        group: 'navigation@2',
      },
    ]);
    expect(manifest.contributes.menus['view/title']).toEqual(
      expect.arrayContaining([
        {
          command: 'prompteur.search',
          when: 'view == prompteur.prompts && !prompteur.filterActive',
          group: 'navigation@3',
        },
        {
          command: 'prompteur.searchActive',
          when: 'view == prompteur.prompts && prompteur.filterActive',
          group: 'navigation@3',
        },
      ]),
    );
    expect(manifest.contributes.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: 'prompteur.search', icon: '$(search)' }),
        expect.objectContaining({ command: 'prompteur.searchActive', icon: '$(filter)' }),
      ]),
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
      ['prompteur.copy', 'Copy Text'],
      ['prompteur.preview', 'Preview'],
    ]);
    expect(manifest.contributes.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: 'prompteur.newPrompt', title: 'New' }),
        expect.objectContaining({ command: 'prompteur.copyPrompt', title: 'Copy Prompt' }),
        expect.objectContaining({
          command: 'prompteur.pastePrompt',
          title: 'Paste Prompt',
          enablement: 'prompteur.hasCopiedPrompt',
        }),
      ]),
    );
    const node = await addPrompt('plain', 'Plain');
    const before = new Map(context.globalState.values);
    await run('copy', node);
    expect(messages.info.at(-1)).toBe('Text copied. Paste into Chat or editor.');
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
    const bundled = resolve('resources/starter/prompts/review-code.prompt.md');
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
    expect(await entries()).toHaveLength(18);
    expect(await fs.readFile(join(userRoot(), 'prompts', 'code-review.yaml'), 'utf8')).toBe(
      'legacy YAML stays untouched',
    );
    await run('addStarters', scopeNode());
    expect(messages.info.at(-1)).toContain('Added 0');
    expect(await fs.readFile(bundled, 'utf8')).toBe(original);
    expect(await fs.readFile(join(userRoot(), 'settings.yaml'), 'utf8')).toContain('templates');
  });
  it('installs eighteen starters as ordinary files without changing bundled source', async () => {
    await run('addStarters', scopeNode());
    expect(await entries()).toHaveLength(18);
    const node = (await entries()).find((item) =>
      item.entry.path.endsWith('review-code.prompt.md'),
    )!;
    expect(await fs.readFile(join(userRoot(), node.entry.path), 'utf8')).toBe(
      await fs.readFile(resolve('resources/starter/prompts/review-code.prompt.md'), 'utf8'),
    );
    await destination();
    await run('copy', node);
    expect(env.clipboard.value).toContain('Review the selected code or available diff:');
  });
  it('adds issue and task starters to an existing library without changing saved prompts', async () => {
    const starterDir = resolve('resources/starter/prompts');
    const target = join(userRoot(), 'prompts');
    await fs.mkdir(target, { recursive: true });
    for (const path of await fs.readdir(starterDir)) {
      if (path === 'create-issue.prompt.md' || path === 'create-task.prompt.md') continue;
      await fs.copyFile(join(starterDir, path), join(target, path));
    }
    const existing = join(target, 'review-code.prompt.md');
    await fs.writeFile(existing, 'Existing user content');

    await run('addStarters', scopeNode());
    expect(messages.info.at(-1)).toContain(
      'Added 2 starter prompts. Saved files matching bundled versions: 15; differing: 1.',
    );
    expect(await fs.readFile(existing, 'utf8')).toBe('Existing user content');
    for (const name of ['create-issue', 'create-task'])
      expect(await fs.readFile(join(target, `${name}.prompt.md`), 'utf8')).toBe(
        await fs.readFile(join(starterDir, `${name}.prompt.md`), 'utf8'),
      );
  });
  it('summarizes saved matches and differences while preserving dirty and invalid prompts', async () => {
    const starterDir = resolve('resources/starter/prompts');
    const paths = (await fs.readdir(starterDir))
      .filter((path) => path.endsWith('.prompt.md'))
      .sort();
    const matching = paths[0]!;
    const invalid = paths[1]!;
    const unsaved = paths[2]!;
    const target = join(userRoot(), 'prompts');
    await fs.mkdir(target, { recursive: true });
    const original = await fs.readFile(join(starterDir, matching), 'utf8');
    await fs.writeFile(join(target, matching), original);
    await fs.writeFile(join(target, invalid), 'invalid frontmatter');
    const dirtyExisting = new FakeDocument(Uri.file(join(target, matching)), original);
    dirtyExisting.change('Unsaved changes to an existing prompt');
    const dirtyMissing = new FakeDocument(Uri.file(join(target, unsaved)), '');
    dirtyMissing.change('Unsaved new prompt');
    workspace.textDocuments.push(dirtyExisting, dirtyMissing);

    await run('addStarters', scopeNode());
    expect(messages.info.at(-1)).toBe(
      'Added 15 starter prompts. Saved files matching bundled versions: 1; differing: 1. Unsaved editors without saved files skipped: 1. No existing files were overwritten.',
    );
    expect(await fs.readFile(join(target, matching), 'utf8')).toBe(original);
    expect(await fs.readFile(join(target, invalid), 'utf8')).toBe('invalid frontmatter');
    await expect(fs.stat(join(target, unsaved))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(dirtyExisting.getText()).toBe('Unsaved changes to an existing prompt');
    expect(dirtyMissing.getText()).toBe('Unsaved new prompt');
    expect(dirtyExisting.isDirty && dirtyMissing.isDirty).toBe(true);
  });
  it('summarizes identical starters when rerun', async () => {
    await run('addStarters', scopeNode());
    await run('addStarters', scopeNode());
    expect(messages.info.at(-1)).toContain(
      'Saved files matching bundled versions: 18; differing: 0',
    );
  });
  it('reports a concurrent starter creation without overwriting it', async () => {
    const originalWrite = LocalFiles.prototype.write;
    let racedPath = '';
    vi.spyOn(LocalFiles.prototype, 'write').mockImplementation(async function (
      this: LocalFiles,
      scope,
      path,
      text,
      expected,
    ) {
      if (!racedPath && scope === 'user' && expected === undefined) {
        racedPath = join(userRoot(), path);
        await fs.mkdir(join(userRoot(), 'prompts'), { recursive: true });
        await fs.writeFile(racedPath, 'concurrent content');
      }
      return originalWrite.call(this, scope, path, text, expected);
    });
    await expect(run('addStarters', scopeNode())).rejects.toThrow(
      'Starter installation stopped after 0 prompts: File changed on disk',
    );
    expect(await fs.readFile(racedPath, 'utf8')).toBe('concurrent content');
    expect(messages.info).toHaveLength(0);
  });
  it('reports partial starter progress on failure and refuses untrusted workspace writes', async () => {
    const originalWrite = LocalFiles.prototype.write;
    let attempts = 0;
    vi.spyOn(LocalFiles.prototype, 'write').mockImplementation(async function (
      this: LocalFiles,
      scope,
      path,
      text,
      expected,
    ) {
      if (++attempts === 2) throw new Error('Disk unavailable');
      return originalWrite.call(this, scope, path, text, expected);
    });
    await expect(run('addStarters', scopeNode())).rejects.toThrow(
      'Starter installation stopped after 1 prompts: Disk unavailable',
    );
    expect(await fs.readdir(join(userRoot(), 'prompts'))).toHaveLength(1);
    expect(messages.info).toHaveLength(0);
    vi.restoreAllMocks();
    workspace.isTrusted = false;
    await expect(run('addStarters', scopeNode('workspace'))).rejects.toThrow(
      'Trust this workspace',
    );
    await expect(fs.stat(join(workspaceRoot(), 'prompts'))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });
  it('copies retained editor selections without changing source or persistent state', async () => {
    const node = await addPrompt();
    const target = await destination();
    await run('edit', node);
    await run('copy', node);
    expect(env.clipboard.value).toBe('Review code in main.ts');
    expect(target.document.getText()).toBe('code');
    const plain = await addPrompt('plain', '{{clipboard}} {{workspace}}');
    const before = new Map(context.globalState.values);
    env.clipboard.value = '{{selection}}';
    await run('copy', plain);
    expect(env.clipboard.value).toBe('{{selection}} project');
    expect(context.globalState.values).toEqual(before);
  });
  it('copies generated prompt text to the clipboard with paste guidance', async () => {
    const node = await addPrompt('chat', 'Review {{selection}} in {{filename}}');
    const target = await destination('selected code');
    await run('copy', node);
    expect(env.clipboard.value).toBe('Review selected code in main.ts');
    expect(messages.info.at(-1)).toBe('Text copied. Paste into Chat or editor.');
    expect(target.document.getText()).toBe('selected code');
  });
  it('lets the Command Palette copy selected prompt text', async () => {
    await addPrompt('palette', 'Ask a useful question');
    await run('copy');
    expect(env.clipboard.value).toBe('Ask a useful question');
  });
  it('registers a read-only prompt tool and returns rendered prompt text with confirmation', async () => {
    const node = await addPrompt('review', 'Review {{selection}} in {{filename}}');
    await destination('selected code');
    const prepared = await promptTool().prepareInvocation?.(
      { input: { query: 'review' } },
      noCancellation,
    );
    const confirmation = prepared?.confirmationMessages?.message;
    expect(typeof confirmation === 'string' ? confirmation : confirmation?.value).toContain(
      'active selection, clipboard text',
    );
    const result = JSON.parse(await runPromptTool({ query: 'review', scope: 'user' })) as {
      status: string;
      workspaceOmittedForTrust: boolean;
      prompt: { name: string; scope: string; path: string };
      missing: string[];
      content: string;
    };
    expect(result).toEqual({
      status: 'match',
      workspaceOmittedForTrust: false,
      prompt: {
        name: 'review',
        category: 'explain',
        scope: 'user',
        path: 'prompts/review.prompt.md',
      },
      missing: [],
      content: 'Review selected code in main.ts',
    });
    expect(await fs.readFile(join(userRoot(), node.entry.path), 'utf8')).toBe(node.entry.source);
  });
  it('returns prompt metadata rather than content when search is ambiguous', async () => {
    await addPrompt('shared-one', 'Use shared pattern one');
    await addPrompt('shared-two', 'Use shared pattern two');
    const result = JSON.parse(await runPromptTool({ query: 'shared' })) as {
      status: string;
      workspaceOmittedForTrust: boolean;
      matches: { name: string; scope: string; path: string }[];
      truncated: boolean;
    };
    expect(result.status).toBe('ambiguous');
    expect(result.workspaceOmittedForTrust).toBe(false);
    expect(result.matches.map((match) => match.name)).toEqual(['shared-one', 'shared-two']);
    expect(result.matches.every((match) => match.scope === 'user')).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result).not.toHaveProperty('content');
  });
  it('prefers a trimmed case-insensitive exact name over full-text matches', async () => {
    await addPrompt('review', 'Exact prompt');
    await addPrompt('other', 'Mention review in this broader match');
    const result = JSON.parse(await runPromptTool({ query: '  REVIEW  ' }));
    expect(result.status).toBe('match');
    expect(result.prompt.path).toBe('prompts/review.prompt.md');
    expect(result.content).toBe('Exact prompt');
  });
  it('auto-selects the unique best across scopes without reading losing prompt context', async () => {
    await addPrompt('alpha', 'inspect {{clipboard}}');
    await addPrompt('inspect-carefully', 'Winner {{selection}}', 'workspace');
    await destination('selected');
    const readClipboard = vi.spyOn(env.clipboard, 'readText');
    const result = JSON.parse(await runPromptTool({ query: 'inspect' }));
    expect(result.status).toBe('match');
    expect(result.prompt.scope).toBe('workspace');
    expect(result.content).toBe('Winner selected');
    expect(readClipboard).not.toHaveBeenCalled();
    workspace.configuration.set('prompteur.search.selection', 'requireChoice');
    const candidates = JSON.parse(await runPromptTool({ query: 'inspect' }));
    expect(candidates.status).toBe('ambiguous');
    expect(candidates.matches.map((match: { name: string }) => match.name)).toEqual([
      'inspect-carefully',
      'alpha',
    ]);
    expect(candidates).not.toHaveProperty('content');
    expect(readClipboard).not.toHaveBeenCalled();
    workspace.configuration.set('prompteur.search.ranking', 'name');
    const alphabetical = JSON.parse(await runPromptTool({ query: 'inspect' }));
    expect(alphabetical.matches.map((match: { name: string }) => match.name)).toEqual([
      'alpha',
      'inspect-carefully',
    ]);
    workspace.configuration.set('prompteur.search.selection', 'bestMatch');
    expect(JSON.parse(await runPromptTool({ query: 'inspect' })).content).toBe('Winner selected');
  });
  it('applies matching phases across both scopes before choosing a result', async () => {
    await addPrompt('other', 'inspect');
    await addPrompt('inspect', 'Exact workspace', 'workspace');
    expect(JSON.parse(await runPromptTool({ query: 'inspect' })).content).toBe('Exact workspace');
    workspace.configuration.set('prompteur.search.matching', 'fuzzy');
    await addPrompt('reviex', 'Fuzzy user');
    await addPrompt('another', 'review', 'workspace');
    const result = JSON.parse(await runPromptTool({ query: 'review' }));
    expect(result.content).toBe('review');
    expect(result.prompt.scope).toBe('workspace');
  });
  it('keeps fuzzy score ties ambiguous and uses distance rather than alphabetical order', async () => {
    workspace.configuration.set('prompteur.search.matching', 'fuzzy');
    await addPrompt('reviewyy', 'Farther');
    await addPrompt('reviewxy', 'Closer {{selection}}');
    await destination('context');
    expect(JSON.parse(await runPromptTool({ query: 'reviewxx' })).content).toBe('Closer context');
    await addPrompt('reviewxz', 'Tied {{clipboard}}', 'workspace');
    const readClipboard = vi.spyOn(env.clipboard, 'readText');
    const result = JSON.parse(await runPromptTool({ query: 'reviewxx' }));
    expect(result.status).toBe('ambiguous');
    expect(result.matches.map((match: { name: string }) => match.name)).toEqual([
      'reviewxy',
      'reviewxz',
      'reviewyy',
    ]);
    expect(result).not.toHaveProperty('content');
    expect(readClipboard).not.toHaveBeenCalled();
  });
  it('computes best match before candidate truncation even with alphabetical ordering', async () => {
    for (let index = 0; index < 11; index++) await addPrompt(`alpha-${index}`, 'inspect');
    await addPrompt('z-inspect', 'Best');
    workspace.configuration.set('prompteur.search.ranking', 'name');
    expect(JSON.parse(await runPromptTool({ query: 'inspect' })).content).toBe('Best');
    workspace.configuration.set('prompteur.search.selection', 'requireChoice');
    const result = JSON.parse(await runPromptTool({ query: 'inspect' }));
    expect(result.matches).toHaveLength(10);
    expect(result.truncated).toBe(true);
    expect(result).not.toHaveProperty('content');
  });
  it('refreshes library filtering for live settings while leaving every matching row visible', async () => {
    await addPrompt('alpha', 'Inspect body');
    const named = await addPrompt('Inspect-carefully', 'Name match');
    const refresh = vi.spyOn(tree(), 'refresh');
    tree().query = 'Inspect';
    expect((await entries()).map((node) => node.entry.data.name)).toEqual([
      'Inspect-carefully',
      'alpha',
    ]);
    workspace.configuration.set('prompteur.search.ranking', 'name');
    configurationChanged.fire({
      affectsConfiguration: (section) => section === 'prompteur.search',
    });
    expect(refresh).toHaveBeenCalled();
    expect((await entries()).map((node) => node.entry.data.name)).toEqual([
      'alpha',
      'Inspect-carefully',
    ]);
    workspace.configuration.set('prompteur.search.matching', 'exact');
    expect(await entries()).toEqual([]);
    tree().query = 'inspect-carefully';
    expect(await entries()).toHaveLength(1);
    workspace.configuration.set('prompteur.search.caseSensitive', true);
    expect(await entries()).toEqual([]);
    expect(JSON.parse(await runPromptTool({ query: 'inspect-carefully' })).status).toBe(
      'not_found',
    );
    expect(JSON.parse(await runPromptTool({ scope: 'user', path: named.entry.path })).content).toBe(
      'Name match',
    );
    workspace.configuration.set('prompteur.search.matching', 'fuzzy');
    workspace.configuration.set('prompteur.search.caseSensitive', false);
    tree().query = 'Inspect-carefullx';
    expect(await entries()).toHaveLength(1);
    expect(JSON.parse(await runPromptTool({ query: tree().query })).content).toBe('Name match');
    tree().query = '';
    expect(await entries()).toHaveLength(2);
  });
  it.each([
    ['matching', 'unsupported'],
    ['caseSensitive', 'yes'],
    ['ranking', 'recent'],
    ['selection', 'first'],
  ])('reports invalid search.%s configuration explicitly', async (key, value) => {
    await addPrompt('inspect', 'Body');
    workspace.configuration.set(`prompteur.search.${key}`, value);
    await expect(runPromptTool({ query: 'inspect' })).rejects.toThrow(
      'Invalid Prompteur search settings',
    );
    expect(await entries()).toEqual([]);
    expect(messages.errors.at(-1)).toContain('Invalid Prompteur search settings');
  });
  it('keeps duplicate exact names ambiguous and renders only the explicitly selected candidate', async () => {
    await addPrompt('review', 'Personal review');
    const selected = await addPrompt('review', 'Workspace review {{selection}}', 'workspace');
    await fs.writeFile(
      join(workspaceRoot(), selected.entry.path),
      encodeMarkdown({ ...selected.entry.data, category: 'review' }),
    );
    await addPrompt('broader', 'review appears here too');
    const readClipboard = vi.spyOn(env.clipboard, 'readText');
    const result = JSON.parse(await runPromptTool({ query: 'review' }));
    expect(result.status).toBe('ambiguous');
    expect(result.matches).toEqual([
      expect.objectContaining({
        name: 'review',
        scope: 'user',
        category: 'explain',
        path: 'prompts/review.prompt.md',
      }),
      expect.objectContaining({
        name: 'review',
        scope: 'workspace',
        category: 'review',
        path: selected.entry.path,
      }),
    ]);
    expect(result).not.toHaveProperty('content');
    expect(readClipboard).not.toHaveBeenCalled();
    await destination('selected code');
    const candidate = result.matches[1];
    const rendered = JSON.parse(
      await runPromptTool({ scope: candidate.scope, path: candidate.path }),
    );
    expect(rendered.status).toBe('match');
    expect(rendered.prompt.scope).toBe('workspace');
    expect(rendered.content).toBe('Workspace review selected code');
    expect(JSON.parse(await runPromptTool({ query: 'review', scope: 'user' })).content).toBe(
      'Personal review',
    );
  });
  it('does not silently select duplicate names within one library', async () => {
    const first = await addPrompt('one', 'First');
    const second = await addPrompt('two', 'Second');
    for (const node of [first, second])
      await fs.writeFile(
        join(userRoot(), node.entry.path),
        encodeMarkdown({ ...node.entry.data, name: 'Same Name' }),
      );
    await run('refresh');
    const result = JSON.parse(await runPromptTool({ query: 'same name', scope: 'user' }));
    expect(result.status).toBe('ambiguous');
    expect(result.matches.map((match: { path: string }) => match.path)).toEqual([
      first.entry.path,
      second.entry.path,
    ]);
    expect(result).not.toHaveProperty('content');
  });
  it('reports stale candidate paths without substituting another matching name', async () => {
    const node = await addPrompt('old', 'Original');
    const replacement = await addPrompt('replacement', 'Different');
    await fs.writeFile(
      join(userRoot(), replacement.entry.path),
      encodeMarkdown({ ...replacement.entry.data, name: 'old' }),
    );
    await fs.unlink(join(userRoot(), node.entry.path));
    await run('refresh');
    const result = JSON.parse(await runPromptTool({ scope: 'user', path: node.entry.path }));
    expect(result).toEqual({
      status: 'not_found',
      scope: 'user',
      path: node.entry.path,
      workspaceOmittedForTrust: false,
    });
    expect(JSON.parse(await runPromptTool({ query: 'old' })).content).toBe('Different');
    expect(
      JSON.parse(await runPromptTool({ scope: 'user', path: '../replacement.prompt.md' })).status,
    ).toBe('not_found');
  });
  it('limits ambiguous candidate metadata without rendering prompt content', async () => {
    for (let index = 0; index < 11; index++) await addPrompt(`shared-${index}`, 'Private body');
    const result = JSON.parse(await runPromptTool({ query: 'shared' }));
    expect(result.status).toBe('ambiguous');
    expect(result.matches).toHaveLength(10);
    expect(result.truncated).toBe(true);
    expect(JSON.stringify(result)).not.toContain('Private body');
  });
  it.each<unknown>([
    null,
    {},
    { query: 42 },
    { query: 'review', scope: 'other' },
    { scope: 'user' },
    { path: 'prompts/review.prompt.md' },
    { scope: 'user', path: 42 },
    { scope: 'user', path: 'prompts/review.prompt.md', query: 'review' },
  ])('rejects invalid runtime tool input: %j', async (input) => {
    await expect(
      // @ts-expect-error Deliberately invoke the tool with an invalid runtime payload.
      promptTool().invoke({ input, toolInvocationToken: undefined }, noCancellation),
    ).rejects.toThrow();
  });
  it('rejects blank paths and oversized search queries explicitly', async () => {
    await expect(runPromptTool({ scope: 'user', path: '  ' })).rejects.toThrow('scope and path');
    await expect(runPromptTool({ query: 'x'.repeat(257) })).rejects.toThrow('256');
  });
  it('reports an empty result and rejects an empty search query', async () => {
    const result = JSON.parse(await runPromptTool({ query: 'no-such-prompt' })) as {
      status: string;
      query: string;
      workspaceOmittedForTrust: boolean;
    };
    expect(result).toEqual({
      status: 'not_found',
      query: 'no-such-prompt',
      workspaceOmittedForTrust: false,
    });
    await expect(runPromptTool({ query: '  ' })).rejects.toThrow('Enter text to search');
  });
  it('requires Workspace Trust before returning Workspace prompt content to Copilot', async () => {
    await addPrompt('workspace-review', 'Inspect workspace', 'workspace');
    workspace.isTrusted = false;
    await expect(runPromptTool({ query: 'workspace', scope: 'workspace' })).rejects.toThrow(
      'Trust this workspace',
    );
    await expect(
      runPromptTool({ scope: 'workspace', path: 'prompts/workspace-review.prompt.md' }),
    ).rejects.toThrow('Trust this workspace');
  });
  it('reports unavailable Workspace libraries', async () => {
    for (const disposable of context.subscriptions) disposable.dispose();
    context.subscriptions = [];
    workspace.workspaceFolders = [];
    await activate(context as unknown as vscode.ExtensionContext);
    await expect(runPromptTool({ query: 'review', scope: 'workspace' })).rejects.toThrow(
      'Workspace prompt library is unavailable',
    );
    await expect(
      runPromptTool({ scope: 'workspace', path: 'prompts/review.prompt.md' }),
    ).rejects.toThrow('Workspace prompt library is unavailable');
  });
  it('cancels a Copilot prompt lookup when its invocation token is cancelled', async () => {
    const token = { ...noCancellation, isCancellationRequested: true };
    await expect(
      promptTool().invoke({ input: { query: 'review' }, toolInvocationToken: undefined }, token),
    ).rejects.toBeInstanceOf(CancellationError);
    await expect(
      promptTool().invoke(
        {
          input: { scope: 'user', path: 'prompts/review.prompt.md' },
          toolInvocationToken: undefined,
        },
        token,
      ),
    ).rejects.toBeInstanceOf(CancellationError);
  });
  it('omits untrusted Workspace prompts and reports the restriction', async () => {
    await addPrompt('personal', 'A personal prompt');
    await addPrompt('workspace-only', 'A workspace prompt', 'workspace');
    workspace.isTrusted = false;
    const result = JSON.parse(await runPromptTool({ query: 'personal' })) as {
      status: string;
      workspaceOmittedForTrust: boolean;
      prompt: { scope: string };
    };
    expect(result.status).toBe('match');
    expect(result.workspaceOmittedForTrust).toBe(true);
    expect(result.prompt.scope).toBe('user');
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
    expect(contextKeys.get('prompteur.hasCopiedPrompt')).toBe(true);
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
    expect(contextKeys.get('prompteur.hasCopiedPrompt')).toBe(true);
    const userCopy = (await entries('user')).find(
      (node) =>
        node.entry.data.name === data.name && node.entry.path !== 'prompts/source.prompt.md',
    );
    expect(userCopy?.entry.data.category).toBe('review');
  });
  it('requires trusted Workspace source copy and reports paste without a buffer', async () => {
    expect(contextKeys.get('prompteur.hasCopiedPrompt')).toBe(false);
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
    expect(contextKeys.get('prompteur.hasCopiedPrompt')).toBe(false);

    workspace.isTrusted = true;
    await run('copyPrompt', source);
    await fs.writeFile(path, encodeMarkdown({ ...newPrompt('Changed'), category: 'review' }));
    await run('refresh');
    workspace.isTrusted = false;
    await run('pastePrompt', scopeNode('user'));
    await run('refresh');
    const userCopy = (await entries('user')).find((node) => node.entry.data.name === data.name);
    expect(userCopy?.entry.data).toMatchObject(data);
    expect(await fs.readFile(path, 'utf8')).toContain('name: Changed');
    expect(
      context.globalState.get<{ files: Record<string, string> }>('syncedUserPrompts')?.files[
        'prompts/workspace-source.prompt.md'
      ],
    ).toContain('name: Workspace Source');
    for (const disposable of context.subscriptions.splice(0)) disposable.dispose();
    await activate(context as unknown as vscode.ExtensionContext);
    expect(contextKeys.get('prompteur.hasCopiedPrompt')).toBe(false);
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
  it('uses multiline text while preserving source context and excluding input editors', async () => {
    const node = await addPrompt('entered', '{{text}}\n{{text}}\n{{selection}} {{filename}}');
    await destination('Source selection');
    const copying = run('copy', node);
    await vi.waitFor(() => expect(window.activeTextEditor?.document.uri.scheme).toBe('untitled'));
    const input = window.activeTextEditor!.document;
    expect(env.clipboard.value).toBe('');
    input.change('Line one\nLine two');
    await run('useText');
    await copying;
    expect(env.clipboard.value).toBe(
      'Line one\nLine two\nLine one\nLine two\nSource selection main.ts',
    );
    expect(contextKeys.get('prompteur.textInputDocuments')).toEqual([]);
    const selectionOnly = await addPrompt('selection-only', '{{selection}} {{filename}}');
    await run('copy', selectionOnly);
    expect(env.clipboard.value).toBe('Source selection main.ts');
  });
  it('cancels text entry without output and previews submitted text', async () => {
    const node = await addPrompt('entered', '{{text}}');
    env.clipboard.value = 'Unchanged';
    const copying = run('copy', node);
    await vi.waitFor(() => expect(window.activeTextEditor?.document.uri.scheme).toBe('untitled'));
    await run('cancelText');
    await copying;
    expect(env.clipboard.value).toBe('Unchanged');
    expect(messages.errors).toEqual([]);
    const previous = window.activeTextEditor!.document;
    const preview = run('preview', node);
    await vi.waitFor(() => expect(window.activeTextEditor!.document).not.toBe(previous));
    window.activeTextEditor!.document.change('User text\nfor preview');
    await run('useText');
    await preview;
    expect(window.activeTextEditor!.document.getText()).toBe('User text\nfor preview');
    expect(env.clipboard.value).toBe('Unchanged');
  });
  it('rechecks Workspace Trust after text entry', async () => {
    const node = await addPrompt('entered', '{{text}}', 'workspace');
    const copying = run('copy', node);
    const rejected = expect(copying).rejects.toThrow('Trust');
    await vi.waitFor(() => expect(window.activeTextEditor?.document.uri.scheme).toBe('untitled'));
    window.activeTextEditor!.document.change('User text');
    workspace.isTrusted = false;
    await run('useText');
    await rejected;
    expect(env.clipboard.value).toBe('');
  });
  it('collects Copilot text only for a chosen prompt and honors cancellation', async () => {
    const first = await addPrompt('text-one', '{{text}}');
    await addPrompt('text-two', '{{text}}');
    expect(JSON.parse(await runPromptTool({ query: 'text-' })).status).toBe('ambiguous');
    expect(contextKeys.get('prompteur.textInputDocuments')).toEqual([]);
    const result = runPromptTool({ scope: 'user', path: first.entry.path });
    await vi.waitFor(() => expect(window.activeTextEditor?.document.uri.scheme).toBe('untitled'));
    window.activeTextEditor!.document.change('Explicit Copilot text\nSecond line');
    await run('useText');
    expect(JSON.parse(await result).content).toBe('Explicit Copilot text\nSecond line');

    const cancellation = new EventEmitter<void>();
    const token = { isCancellationRequested: false, onCancellationRequested: cancellation.event };
    const previous = window.activeTextEditor!.document;
    const invocation = promptTool().invoke(
      { input: { scope: 'user', path: first.entry.path }, toolInvocationToken: undefined },
      token,
    );
    const rejected = expect(invocation).rejects.toBeInstanceOf(CancellationError);
    await vi.waitFor(() => expect(window.activeTextEditor!.document).not.toBe(previous));
    token.isCancellationRequested = true;
    cancellation.fire();
    await rejected;
    expect(contextKeys.get('prompteur.textInputDocuments')).toEqual([]);
  });
  it.each(['filename', 'workspace', 'filename, workspace'])(
    'copies without blocking when optional context is missing: %s',
    async (missing) => {
      workspace.workspaceFolders = [];
      const content = missing
        .split(', ')
        .map((name) => `{{${name}}}`)
        .join(' ');
      const node = await addPrompt('optional-context', `Review ${content}`);
      env.clipboard.value = 'previous clipboard';
      await run('copy', node);
      expect(env.clipboard.value).toBe(`Review ${missing.includes(',') ? ' ' : ''}`);
      expect(messages.warnings).toEqual([]);
      expect(messages.info).toEqual([`Copied without context: ${missing}.`]);
      await run('preview', node);
      expect(window.activeTextEditor!.document.getText()).toContain(
        `Empty variable values: ${missing}`,
      );
    },
  );
  it('confirms empty clipboard input, honors cancellation and reports unsupported variables', async () => {
    const node = await addPrompt('empty', '{{clipboard}}');
    responses.warning.push(null);
    await run('copy', node);
    expect(env.clipboard.value).toBe('');
    expect(messages.warnings.at(-1)).toContain('Clipboard is empty');
    expect(messages.info).toEqual([]);
    responses.warning.push('Continue');
    await run('copy', node);
    expect(messages.info).toEqual(['Copied without context: clipboard.']);
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
    expect(contextKeys.get('prompteur.filterActive')).toBe(false);
    await run('search');
    const box = inputBoxes[0]!;
    box.valueChanged.fire('nonexistent');
    await vi.waitFor(() => expect(contextKeys.get('prompteur.filterActive')).toBe(true));
    expect(await entries()).toHaveLength(0);
    box.valueChanged.fire('  ');
    await vi.waitFor(() => expect(contextKeys.get('prompteur.filterActive')).toBe(false));
    box.valueChanged.fire('nonexistent');
    await vi.waitFor(() => expect(contextKeys.get('prompteur.filterActive')).toBe(true));
    box.accepted.fire();
    await run('searchActive');
    const reopened = inputBoxes.at(-1)!;
    expect(reopened.value).toBe('nonexistent');
    await run('clearSearch');
    expect(contextKeys.get('prompteur.filterActive')).toBe(false);
    expect(reopened.value).toBe('');
    expect(await entries()).toHaveLength(1);
  });
  it('keeps the active indicator in order during rapid filter changes', async () => {
    const execute = commands.executeCommand.bind(commands);
    let release!: () => void;
    let started!: () => void;
    const activeUpdateStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const delayed = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = vi.spyOn(commands, 'executeCommand').mockImplementation(async (id, ...args) => {
      if (id === 'setContext' && args[0] === 'prompteur.filterActive' && args[1] === true) {
        started();
        await delayed;
      }
      return execute(id, ...args);
    });
    await run('search');
    inputBoxes.at(-1)!.valueChanged.fire('review');
    await activeUpdateStarted;
    const clear = run('clearSearch');
    release();
    await clear;
    expect(contextKeys.get('prompteur.filterActive')).toBe(false);
    expect(tree().query).toBe('');
    spy.mockRestore();
  });
  it('reports filter indicator errors and processes subsequent changes', async () => {
    const execute = commands.executeCommand.bind(commands);
    const spy = vi.spyOn(commands, 'executeCommand').mockImplementation(async (id, ...args) => {
      if (id === 'setContext' && args[0] === 'prompteur.filterActive' && args[1] === true)
        throw new Error('Filter indicator unavailable');
      return execute(id, ...args);
    });
    await run('search');
    inputBoxes.at(-1)!.valueChanged.fire('review');
    await vi.waitFor(() =>
      expect(messages.errors.at(-1)).toContain('Filter indicator unavailable'),
    );
    await run('clearSearch');
    expect(contextKeys.get('prompteur.filterActive')).toBe(false);
    spy.mockRestore();
  });
  it('appends tooltip filters to the open search and opens validated prompt paths', async () => {
    const userPrompt = await addPrompt('tooltip-user', 'needle');
    const workspacePrompt = await addPrompt('tooltip-workspace', 'safe', 'workspace');
    await run('search');
    const box = inputBoxes.at(-1)!;
    box.valueChanged.fire('needle');
    await commands.executeCommand('prompteur.filterFromTooltip', 'tag', 'security review');
    expect(contextKeys.get('prompteur.filterActive')).toBe(true);
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
    expect(contextKeys.get('prompteur.filterActive')).toBe(false);
    box.hide();
    await commands.executeCommand('prompteur.filterFromTooltip', 'tag', 'security');
    expect(contextKeys.get('prompteur.filterActive')).toBe(true);
    await run('searchActive');
    expect(inputBoxes.at(-1)!.value).toBe('tag:"security"');
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
    expect(await entries('workspace')).toHaveLength(18);
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
    expect(await entries('workspace')).toHaveLength(19);

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

    workspace.configuration.set('prompteur.groupByCategory', false);
    configurationChanged.fire({
      affectsConfiguration: (section) => section === 'prompteur.groupByCategory',
    });
    expect(refresh).toHaveBeenCalledTimes(previousRefreshCount + 2);
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
