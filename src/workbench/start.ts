import * as vscode from 'vscode';
import { basename } from 'node:path';
import { LocalFiles } from '../platform/local-files';
import { LibraryService, messageOf } from '../application/library';
import { appendExactFilter, type SearchOptions } from '../application/search';
import {
  newPrompt,
  promptFolder,
  promptCategories,
  type Entry,
  type PromptData,
  type Scope,
} from '../core/documents';
import { generate, variableTokens, type Context } from '../core/render';
import { NativeEditor } from './editor';
import { PromptLibraryTool } from './prompt-tool';
import { PromptTree, type TreeNode } from './tree';
import { UserPromptSync } from './user-prompt-sync';
import { watchLibrary } from './watch';
import { TextInput } from './text-input';

const addCategoryValue = '__add_category__';
const removeCategoryValue = '__remove_category__';

class Workbench implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly roots = new Map<Scope, vscode.Uri>();
  private readonly service: LibraryService;
  private readonly userPromptSync: UserPromptSync;
  private readonly editor: NativeEditor;
  private readonly tree: PromptTree;
  private readonly textInput = new TextInput();
  private target: vscode.TextEditor | undefined;
  private searchBox: vscode.InputBox | undefined;
  private filterContextUpdate: Promise<void> = Promise.resolve();
  private copiedPrompt: { data: PromptData; source: string } | undefined;
  private readonly approvedCategories = new Set<string>();

  constructor(private readonly context: vscode.ExtensionContext) {
    const savedCategories = context.globalState.get<unknown>('approvedPromptCategories', []);
    if (Array.isArray(savedCategories))
      for (const value of savedCategories) {
        if (typeof value !== 'string') continue;
        const category = value.trim().toLowerCase();
        if (category && !promptCategories.some((builtin) => builtin === category))
          this.approvedCategories.add(category);
      }
    const userStorage =
      context.globalStorageUri.scheme === 'file'
        ? context.globalStorageUri
        : vscode.Uri.file(context.globalStoragePath);
    this.roots.set('user', vscode.Uri.joinPath(userStorage, 'prompts'));
    const workspace = vscode.workspace.workspaceFolders?.[0];
    if (workspace?.uri.scheme === 'file')
      this.roots.set('workspace', vscode.Uri.joinPath(workspace.uri, '.vscode', 'prompts'));
    const files = new LocalFiles(
      (scope) => {
        const root = this.roots.get(scope);
        if (!root || root.scheme !== 'file')
          throw new Error('Only local filesystem libraries are supported');
        return root.fsPath;
      },
      (scope) => {
        if (scope === 'workspace' && !vscode.workspace.isTrusted)
          throw new Error('Trust this workspace before modifying its library');
      },
    );
    this.service = new LibraryService(
      files,
      (error) => this.report(error),
      () => this.allowedCategories(),
      () => this.searchOptions(),
    );
    if (vscode.lm?.registerTool)
      this.disposables.push(
        vscode.lm.registerTool(
          'prompteur_findPrompt',
          new PromptLibraryTool(
            this.service,
            () => this.roots.has('workspace'),
            () => vscode.workspace.isTrusted,
            (entry, token) => this.generate(entry, this.destination(), token),
            () => this.searchOptions().selection,
          ),
        ),
      );
    this.userPromptSync = new UserPromptSync(context.globalState, files);
    this.editor = new NativeEditor(this.service, this.roots, () => this.allowedCategories());
    this.tree = new PromptTree(
      this.service,
      () => this.roots.has('workspace'),
      (error) => this.report(error),
      () => vscode.workspace.getConfiguration('prompteur').get<boolean>('showTags', true),
      () =>
        vscode.workspace
          .getConfiguration('prompteur')
          .get<'filtered' | 'total' | 'hidden'>('categoryCountMode', 'filtered'),
      () => vscode.workspace.getConfiguration('prompteur').get<boolean>('groupByCategory', true),
    );
    this.disposables.push(
      this.editor,
      this.textInput,
      this.tree,
      vscode.window.createTreeView('prompteur.prompts', {
        treeDataProvider: this.tree,
        showCollapseAll: true,
      }),
    );
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('prompteur.showTags') ||
          event.affectsConfiguration('prompteur.categoryCountMode') ||
          event.affectsConfiguration('prompteur.groupByCategory') ||
          event.affectsConfiguration('prompteur.search')
        )
          this.tree.refresh();
        if (event.affectsConfiguration('prompteur.syncUserPrompts'))
          void this.configurePromptSync().catch((error) => this.report(error));
      }),
    );
    this.target = vscode.window.activeTextEditor;
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor && this.isDestination(editor)) this.target = editor;
      }),
    );
    const actions: Record<string, (node?: TreeNode) => Promise<unknown>> = {
      newPrompt: (node) => this.create(node),
      addStarters: (node) => this.addStarters(node),
      removeCategory: () => this.removeApprovedCategory(),
      edit: (node) => this.edit(node),
      delete: (node) => this.remove(node),
      duplicate: (node) => this.duplicate(node),
      copy: (node) => this.copy(node),
      copyPrompt: (node) => this.copyPrompt(node),
      pastePrompt: (node) => this.pastePrompt(node),
      preview: (node) => this.preview(node),
      search: () => this.search(),
      searchActive: () => this.search(),
      useText: () => this.textInput.submit(),
      cancelText: () => this.textInput.cancel(),
      openSettings: async () => {
        await vscode.commands.executeCommand(
          'workbench.action.openSettings',
          '@ext:dmundt.prompteur',
        );
      },
      clearSearch: async () => {
        if (this.searchBox) this.searchBox.value = '';
        await this.setFilter('');
      },
      refresh: async () => {
        await this.userPromptSync.reconcile();
        for (const scope of this.roots.keys()) await this.service.refresh(scope);
      },
    };
    for (const [name, action] of Object.entries(actions))
      this.disposables.push(
        vscode.commands.registerCommand(`prompteur.${name}`, async (node?: TreeNode) => {
          try {
            await action(node);
          } catch (error) {
            if (error instanceof vscode.CancellationError) return;
            this.report(error);
            throw error;
          }
        }),
      );
    this.disposables.push(
      vscode.commands.registerCommand(
        'prompteur.filterFromTooltip',
        async (kind: unknown, value: unknown) => {
          try {
            await this.filterFromTooltip(kind, value);
          } catch (error) {
            this.report(error);
            throw error;
          }
        },
      ),
      vscode.commands.registerCommand(
        'prompteur.openPromptPath',
        async (scope: unknown, path: unknown) => {
          try {
            await this.openPromptPath(scope, path);
          } catch (error) {
            this.report(error);
            throw error;
          }
        },
      ),
    );
  }

  private searchOptions(): SearchOptions & { selection: 'bestMatch' | 'requireChoice' } {
    const configuration = vscode.workspace.getConfiguration('prompteur');
    const matching = configuration.get<unknown>('search.matching', 'fullText');
    const caseSensitive = configuration.get<unknown>('search.caseSensitive', false);
    const ranking = configuration.get<unknown>('search.ranking', 'relevance');
    const selection = configuration.get<unknown>('search.selection', 'bestMatch');
    if (
      (matching !== 'exact' && matching !== 'fullText' && matching !== 'fuzzy') ||
      typeof caseSensitive !== 'boolean' ||
      (ranking !== 'relevance' && ranking !== 'name') ||
      (selection !== 'bestMatch' && selection !== 'requireChoice')
    )
      throw new Error(
        'Invalid Prompteur search settings. Check matching, case sensitivity, ranking, and selection.',
      );
    return { matching, caseSensitive, ranking, selection };
  }

  private report(error: unknown): void {
    void vscode.window.showErrorMessage(`Prompteur: ${messageOf(error)}`);
  }

  private allowedCategories(): string[] {
    return [
      ...promptCategories,
      ...[...this.approvedCategories].sort((left, right) => left.localeCompare(right)),
    ];
  }

  private categoryValue(value: string): string | undefined {
    const normalized = value.trim().toLowerCase();
    return this.allowedCategories().find((category) => category === normalized);
  }

  private async filterFromTooltip(kind: unknown, value: unknown): Promise<void> {
    if ((kind !== 'tag' && kind !== 'category') || typeof value !== 'string' || !value.trim())
      throw new Error('Invalid prompt filter link');
    const query = appendExactFilter(this.tree.query, kind, value);
    if (this.searchBox) this.searchBox.value = query;
    await this.setFilter(query);
  }

  private setFilter(query: string): Promise<void> {
    this.tree.query = query;
    this.tree.refresh();
    const update = this.filterContextUpdate.then(async () => {
      await vscode.commands.executeCommand('setContext', 'prompteur.filterActive', !!query.trim());
    });
    this.filterContextUpdate = update.catch(() => undefined);
    return update;
  }

  private async openPromptPath(scope: unknown, path: unknown): Promise<void> {
    if ((scope !== 'user' && scope !== 'workspace') || typeof path !== 'string')
      throw new Error('Invalid prompt path link');
    const entry = (await this.service.get(scope)).entries.find(
      (candidate) => candidate.path === path,
    );
    if (!entry) throw new Error('Prompt changed or became invalid. Reload or repair its YAML.');
    await vscode.window.showTextDocument(this.uri(entry));
  }

  private uri(entry: Pick<Entry, 'scope' | 'path'>): vscode.Uri {
    return vscode.Uri.joinPath(this.roots.get(entry.scope)!, entry.path);
  }

  private isDestination(editor: vscode.TextEditor): boolean {
    return (
      !editor.document.isClosed &&
      !this.editor.contains(editor.document.uri) &&
      !this.editor.isPreview(editor.document) &&
      !this.textInput.contains(editor.document)
    );
  }

  private destination(): vscode.TextEditor | undefined {
    const active = vscode.window.activeTextEditor;
    if (active && this.isDestination(active)) return active;
    return this.target && this.isDestination(this.target) ? this.target : undefined;
  }

  private async scope(node?: TreeNode): Promise<Scope | undefined> {
    if (node) return node.scope;
    const defaultScope = vscode.workspace
      .getConfiguration('prompteur')
      .get<unknown>('defaultScope', 'ask');
    if (defaultScope === 'user') return 'user';
    if (defaultScope === 'workspace') {
      if (!this.roots.has('workspace'))
        throw new Error('Workspace library is unavailable in this window');
      return 'workspace';
    }
    if (!this.roots.has('workspace')) return 'user';
    return (
      await vscode.window.showQuickPick(
        [
          { label: 'User', value: 'user' as const },
          { label: 'Workspace', value: 'workspace' as const },
        ],
        { title: 'Choose library' },
      )
    )?.value;
  }

  private async pickCategory(title = 'Choose category'): Promise<string | undefined> {
    const choices = this.allowedCategories().map((category) => ({
      label: category.charAt(0).toUpperCase() + category.slice(1),
      value: category,
    }));
    choices.push({ label: '$(add) Add Category...', value: addCategoryValue });
    if (this.approvedCategories.size)
      choices.push({ label: '$(remove) Remove Category...', value: removeCategoryValue });
    const preferredCategory = vscode.workspace
      .getConfiguration('prompteur')
      .get<unknown>('preferredCategory', '');
    const preferred =
      typeof preferredCategory === 'string'
        ? choices.find((choice) => choice.value === this.categoryValue(preferredCategory))
        : undefined;
    const choice = await new Promise<(typeof choices)[number] | undefined>((resolve) => {
      const picker = vscode.window.createQuickPick<(typeof choices)[number]>();
      let settled = false;
      const finish = (selected?: (typeof choices)[number]) => {
        if (settled) return;
        settled = true;
        picker.dispose();
        resolve(selected);
      };
      picker.title = title;
      picker.items = choices;
      picker.activeItems = preferred ? [preferred] : [];
      picker.onDidAccept(() => finish(picker.selectedItems[0] ?? picker.activeItems[0]));
      picker.onDidHide(() => finish());
      picker.show();
    });
    if (!choice) return undefined;
    if (choice.value === addCategoryValue) return this.addCategory();
    if (choice.value === removeCategoryValue) {
      await this.removeApprovedCategory();
      return undefined;
    }
    return choice.value;
  }

  private async addCategory(): Promise<string | undefined> {
    const value = await vscode.window.showInputBox({
      title: 'Add prompt category',
      prompt: 'Category name for this VS Code profile',
      validateInput: (input) => {
        const category = input.trim().toLowerCase();
        if (!category) return 'Category name is required';
        if (category.length > 64) return 'Category name must be 64 characters or fewer';
        if (
          this.categoryValue(category) ||
          category === addCategoryValue ||
          category === removeCategoryValue
        )
          return 'Category is already approved';
        return undefined;
      },
    });
    if (!value?.trim()) return undefined;
    const category = value.trim().toLowerCase();
    const answer = await vscode.window.showWarningMessage(
      `Add "${category}" to this VS Code profile's User and Workspace categories?`,
      { modal: true },
      'Add Category',
    );
    if (answer !== 'Add Category') return undefined;

    this.approvedCategories.add(category);
    try {
      await this.context.globalState.update(
        'approvedPromptCategories',
        [...this.approvedCategories].sort((left, right) => left.localeCompare(right)),
      );
    } catch (error) {
      this.approvedCategories.delete(category);
      throw error;
    }
    for (const scope of this.roots.keys()) {
      try {
        await this.service.refresh(scope);
      } catch (error) {
        this.report(error);
      }
    }
    return category;
  }

  private async removeApprovedCategory(): Promise<void> {
    const categories = [...this.approvedCategories].sort((left, right) =>
      left.localeCompare(right),
    );
    if (!categories.length) {
      void vscode.window.showInformationMessage('No approved custom categories to remove.');
      return;
    }
    const choice = await vscode.window.showQuickPick(
      categories.map((category) => ({
        label: category.charAt(0).toUpperCase() + category.slice(1),
        value: category,
      })),
      { title: 'Remove approved category' },
    );
    if (!choice) return;

    let usageCount = 0;
    for (const scope of this.roots.keys()) {
      await this.service.refresh(scope);
      usageCount += (await this.service.get(scope)).entries.filter(
        (entry) => entry.data.category === choice.value,
      ).length;
    }
    if (usageCount) {
      const promptNoun = usageCount === 1 ? 'prompt' : 'prompts';
      const promptVerb = usageCount === 1 ? 'uses' : 'use';
      throw new Error(
        `Cannot remove "${choice.value}" while ${usageCount} ${promptNoun} ${promptVerb} it. Reassign them first.`,
      );
    }

    const answer = await vscode.window.showWarningMessage(
      `Remove "${choice.value}" from this VS Code profile's approved categories?`,
      { modal: true },
      'Remove Category',
    );
    if (answer !== 'Remove Category') return;

    this.approvedCategories.delete(choice.value);
    try {
      await this.context.globalState.update(
        'approvedPromptCategories',
        [...this.approvedCategories].sort((left, right) => left.localeCompare(right)),
      );
    } catch (error) {
      this.approvedCategories.add(choice.value);
      throw error;
    }
    for (const scope of this.roots.keys()) {
      try {
        await this.service.refresh(scope);
      } catch (error) {
        this.report(error);
      }
    }
    void vscode.window.showInformationMessage(`Removed "${choice.value}".`);
  }

  private assertTrusted(entry: Entry): void {
    if (entry.scope === 'workspace' && !vscode.workspace.isTrusted)
      throw new Error('Trust this workspace before using its prompts');
  }

  private async pick(node?: TreeNode): Promise<Entry | undefined> {
    if (node?.kind === 'entry') {
      const entry = (await this.service.get(node.scope)).entries.find(
        (entry) => entry.path === node.entry.path,
      );
      if (!entry) throw new Error('Prompt changed or became invalid. Reload or repair its YAML.');
      return this.editor.live(entry);
    }
    const entries = (
      await Promise.all([...this.roots.keys()].map((scope) => this.service.get(scope)))
    )
      .flatMap((snapshot) => snapshot.entries)
      .sort((left, right) => left.data.name.localeCompare(right.data.name));
    const picked = await vscode.window.showQuickPick(
      entries.map((entry) => ({
        label: entry.data.name,
        description: `${entry.scope} · ${entry.path}`,
        entry,
      })),
      { title: 'Choose prompt', matchOnDescription: true },
    );
    return picked ? this.editor.live(picked.entry) : undefined;
  }

  private async availablePath(scope: Scope, name: string, parent = promptFolder): Promise<string> {
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'prompt';
    for (let suffix = 1; suffix <= 1000; suffix++) {
      const path = `${parent}/${slug}${suffix === 1 ? '' : `-${suffix}`}.prompt.md`;
      if ((await this.service.readFile(scope, path)) === undefined) return path;
    }
    throw new Error('Too many files with the same name');
  }

  private async edit(node?: TreeNode): Promise<void> {
    if (node?.kind === 'problem') {
      await vscode.window.showTextDocument(this.uri(node));
      return;
    }
    const entry = await this.pick(node);
    if (entry) await vscode.window.showTextDocument(this.uri(entry));
  }

  private async create(node?: TreeNode): Promise<void> {
    const scope = await this.scope(node);
    if (!scope) return;
    if (scope === 'workspace' && !vscode.workspace.isTrusted)
      throw new Error('Trust this workspace before modifying its library');
    const category =
      node?.kind === 'category' ? this.categoryValue(node.category) : await this.pickCategory();
    if (!category) {
      if (node?.kind === 'category') throw new Error('Choose an approved prompt category.');
      return;
    }
    const name = await vscode.window.showInputBox({
      title: 'New prompt',
      prompt: 'Name',
      validateInput: (value) => (value.trim() ? undefined : 'Name is required'),
    });
    if (!name?.trim()) return;
    const path = await this.availablePath(scope, name);
    const data = newPrompt(name.trim(), category);
    await this.service.save(scope, path, data, undefined);
    await vscode.window.showTextDocument(this.uri({ scope, path }));
  }

  private async addStarters(node?: TreeNode): Promise<void> {
    const scope = await this.scope(node);
    if (!scope) return;
    const directory = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'starter');
    const catalog = await new LibraryService(new LocalFiles(() => directory.fsPath)).get('user');
    if (catalog.problems.length) throw new Error('Bundled starter prompts are invalid');
    let added = 0;
    let identical = 0;
    let different = 0;
    let unsaved = 0;
    for (const entry of catalog.entries) {
      try {
        const existing = await this.service.readFile(scope, entry.path);
        if (existing !== undefined) {
          if (existing === entry.source) identical++;
          else different++;
          continue;
        }
        const uri = this.uri({ scope, path: entry.path }).toString();
        if (
          vscode.workspace.textDocuments.some(
            (document) => document.uri.toString() === uri && document.isDirty,
          )
        ) {
          unsaved++;
          continue;
        }
        await this.service.writeSource(scope, entry.path, entry.source, undefined);
        added++;
      } catch (error) {
        throw new Error(
          `Starter installation stopped after ${added} prompts: ${messageOf(error)}`,
          { cause: error },
        );
      }
    }
    void vscode.window.showInformationMessage(
      `Added ${added} starter prompts. Saved files matching bundled versions: ${identical}; differing: ${different}. Unsaved editors without saved files skipped: ${unsaved}. No existing files were overwritten.`,
    );
  }

  private async remove(node?: TreeNode): Promise<void> {
    const entry = await this.pick(node);
    if (!entry) return;
    if (
      vscode.workspace.textDocuments.some(
        (document) => document.uri.toString() === this.uri(entry).toString() && document.isDirty,
      )
    )
      throw new Error('Save or discard this document before deleting it');
    const answer = await vscode.window.showWarningMessage(
      `Permanently delete ${entry.data.name}?`,
      { modal: true },
      'Delete',
    );
    if (answer === 'Delete') await this.service.delete(entry);
  }

  private async duplicate(node?: TreeNode): Promise<void> {
    const entry = await this.pick(node);
    if (!entry) return;
    const data = { ...entry.data, name: `${entry.data.name} copy` };
    const path = await this.availablePath(
      entry.scope,
      data.name,
      entry.path.slice(0, entry.path.lastIndexOf('/')),
    );
    await this.service.save(entry.scope, path, data, undefined, entry.source);
    await vscode.window.showTextDocument(this.uri({ scope: entry.scope, path }));
  }

  private async copyPrompt(node?: TreeNode): Promise<void> {
    const entry = await this.pick(node);
    if (!entry) return;
    this.assertTrusted(entry);
    this.copiedPrompt = {
      data: { ...entry.data, tags: [...entry.data.tags] },
      source: entry.source,
    };
    await vscode.commands.executeCommand('setContext', 'prompteur.hasCopiedPrompt', true);
    void vscode.window.showInformationMessage(
      'Prompt copied. Paste Prompt to create a library copy.',
    );
  }

  private async pastePrompt(node?: TreeNode): Promise<void> {
    if (!this.copiedPrompt) {
      void vscode.window.showInformationMessage('Copy a prompt before pasting.');
      return;
    }
    if (node && node.kind !== 'scope' && node.kind !== 'category')
      throw new Error('Choose a library or category to paste into.');
    const scope = await this.scope(node);
    if (!scope) return;
    if (scope === 'workspace' && !vscode.workspace.isTrusted)
      throw new Error('Trust this workspace before modifying its library');
    const category =
      node?.kind === 'category'
        ? this.categoryValue(node.category)
        : this.copiedPrompt.data.category;
    if (!category) throw new Error('Choose an approved prompt category.');
    const data = {
      ...this.copiedPrompt.data,
      tags: [...this.copiedPrompt.data.tags],
      category,
    };
    const path = await this.availablePath(scope, data.name);
    await this.service.save(scope, path, data, undefined, this.copiedPrompt.source);
    await vscode.window.showTextDocument(this.uri({ scope, path }));
  }

  private async generate(
    entry: Entry,
    target: vscode.TextEditor | undefined,
    token?: vscode.CancellationToken,
  ) {
    this.assertTrusted(entry);
    const tokens = variableTokens(entry.data.content);
    const needsClipboard = tokens.some((token) => token.name === 'clipboard');
    const context: Context = {
      selection: target?.document.getText(target.selection) ?? '',
      clipboard: needsClipboard ? await vscode.env.clipboard.readText() : '',
      filename: target ? basename(target.document.fileName) : '',
      workspace:
        (target ? vscode.workspace.getWorkspaceFolder(target.document.uri)?.name : undefined) ??
        vscode.workspace.workspaceFolders?.[0]?.name ??
        '',
    };
    if (tokens.some((token) => token.name === 'text'))
      context.text = await this.textInput.request(token);
    if (token?.isCancellationRequested) throw new vscode.CancellationError();
    this.assertTrusted(entry);
    return generate(entry.data.content, context);
  }

  private async copy(node?: TreeNode): Promise<void> {
    const target = this.destination();
    const entry = await this.pick(node);
    if (!entry) return;
    const result = await this.generate(entry, target);
    if (
      result.missing.includes('clipboard') &&
      (await vscode.window.showWarningMessage(
        'Clipboard is empty. Copy the prompt without clipboard input?',
        { modal: true },
        'Continue',
      )) !== 'Continue'
    )
      return;
    await vscode.env.clipboard.writeText(result.text);
    void vscode.window.showInformationMessage(
      result.missing.length
        ? `Copied without context: ${result.missing.join(', ')}.`
        : 'Text copied. Paste into Chat or editor.',
    );
  }

  private async preview(node?: TreeNode): Promise<void> {
    const entry = await this.pick(node);
    if (!entry) return;
    const result = await this.generate(entry, this.destination());
    const document = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: `${result.missing.length ? `Empty variable values: ${result.missing.join(', ')}\n\n` : ''}${result.text}`,
    });
    this.editor.markPreview(document);
    await vscode.window.showTextDocument(document, { preview: true, preserveFocus: true });
  }

  private async search(): Promise<void> {
    const box = vscode.window.createInputBox();
    box.title = 'Filter prompts (tag:value, category:value)';
    box.value = this.tree.query;
    this.searchBox = box;
    const changed = box.onDidChangeValue((value) => {
      void this.setFilter(value).catch((error) => this.report(error));
    });
    const accepted = box.onDidAccept(() => box.hide());
    box.onDidHide(() => {
      changed.dispose();
      accepted.dispose();
      if (this.searchBox === box) this.searchBox = undefined;
      box.dispose();
    });
    box.show();
  }

  async initialize(): Promise<void> {
    // Initial sync runs in the background so activation stays within its time budget.
    // Operations are serialized by UserPromptSync's queue, so later persist calls remain ordered.
    void this.configurePromptSync().catch((error) => this.report(error));
    this.disposables.push({
      dispose: this.service.subscribe((scope) => {
        if (scope === 'user')
          void this.userPromptSync.persist().catch((error) => this.report(error));
      }),
    });
    for (const [scope, root] of this.roots)
      this.disposables.push(watchLibrary(root, scope, this.service, (error) => this.report(error)));
  }

  private async configurePromptSync(): Promise<void> {
    const enabled = vscode.workspace
      .getConfiguration('prompteur')
      .get<boolean>('syncUserPrompts', true);
    await this.userPromptSync.configure(enabled);
    if (enabled) await this.service.refresh('user');
  }

  dispose(): void {
    for (const disposable of this.disposables.reverse()) disposable.dispose();
  }
}

export async function start(context: vscode.ExtensionContext): Promise<void> {
  await vscode.commands.executeCommand('setContext', 'prompteur.hasCopiedPrompt', false);
  await vscode.commands.executeCommand('setContext', 'prompteur.filterActive', false);
  await vscode.commands.executeCommand('setContext', 'prompteur.textInputDocuments', []);
  const workbench = new Workbench(context);
  context.subscriptions.push(workbench);
  await workbench.initialize();
}
