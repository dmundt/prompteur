import * as vscode from 'vscode';
import { basename } from 'node:path';
import { LocalFiles } from '../platform/local-files';
import { LibraryService, messageOf } from '../application/library';
import { appendExactFilter, type SearchOptions } from '../application/search';
import {
  newPrompt,
  decodeMarkdown,
  encodeMarkdown,
  promptFolder,
  promptCategories,
  PromptDocumentError,
  type Entry,
  type PromptData,
  type Scope,
} from '../core/documents';
import { documentByteLimit } from '../core/limits';
import { generate, variableTokens, type Context } from '../core/render';
import { NativeEditor } from './editor';
import { PromptLibraryTool } from './prompt-tool';
import { PromptTree, type TreeNode } from './tree';
import { categoryDescriptionsStateKey, UserPromptSync } from './user-prompt-sync';
import { watchLibrary } from './watch';
import { TextInput } from './text-input';

const addCategoryValue = '__add_category__';
const removeCategoryValue = '__remove_category__';
const categoryDescriptionLimit = 240;

class Workbench implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly roots = new Map<Scope, vscode.Uri>();
  private readonly service: LibraryService;
  private readonly userPromptSync: UserPromptSync;
  private readonly editor: NativeEditor;
  private readonly tree: PromptTree;
  private readonly treeView: vscode.TreeView<TreeNode>;
  private readonly scopeCounts = new Map<Scope, { filtered: number; total: number }>();
  private countUpdate = 0;
  private disposed = false;
  private readonly textInput = new TextInput();
  private target: vscode.TextEditor | undefined;
  private searchBox: vscode.InputBox | undefined;
  private disposeSearch: (() => void) | undefined;
  private filterContextUpdate: Promise<void> = Promise.resolve();
  private copiedPrompt: { data: PromptData; source: string } | undefined;
  private readonly approvedCategories = new Set<string>();
  private categoryDescriptions = new Map<string, string>();
  private renamingCategory = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    const savedCategories = context.globalState.get<unknown>('approvedPromptCategories', []);
    if (Array.isArray(savedCategories))
      for (const value of savedCategories) {
        if (typeof value !== 'string') continue;
        const category = value.trim().toLowerCase();
        if (category && !promptCategories.some((builtin) => builtin === category))
          this.approvedCategories.add(category);
      }
    const descriptions = context.globalState.get<unknown>(categoryDescriptionsStateKey, {});
    if (!descriptions || typeof descriptions !== 'object' || Array.isArray(descriptions))
      throw new Error('Invalid custom category descriptions in profile state');
    for (const [category, description] of Object.entries(descriptions)) {
      if (
        !category.trim() ||
        category !== category.trim().toLowerCase() ||
        category.length > 64 ||
        typeof description !== 'string' ||
        description.length > categoryDescriptionLimit ||
        /[\r\n]/.test(description)
      )
        throw new Error('Invalid custom category descriptions in profile state');
      if (this.approvedCategories.has(category) && description.trim())
        this.categoryDescriptions.set(category, description.trim());
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
      (scope) => this.roots.get(scope),
      (category) =>
        this.approvedCategories.has(category)
          ? (this.categoryDescriptions.get(category) ?? '')
          : undefined,
      (scope) => {
        const mode = vscode.workspace
          .getConfiguration('prompteur')
          .get<'filtered' | 'total' | 'hidden'>('categoryCountMode', 'filtered');
        return mode === 'hidden' ? undefined : this.scopeCounts.get(scope)?.[mode];
      },
    );
    this.treeView = vscode.window.createTreeView('prompteur.prompts', {
      treeDataProvider: this.tree,
      showCollapseAll: true,
    });
    this.disposables.push(this.editor, this.textInput, this.tree, this.treeView);
    let viewWasVisible = this.treeView.visible;
    const expandScopes = () => void this.expandLibraryScopes().catch((error) => this.report(error));
    this.disposables.push(
      this.treeView.onDidChangeVisibility(({ visible }) => {
        if (visible && !viewWasVisible) expandScopes();
        viewWasVisible = visible;
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
        if (event.affectsConfiguration('prompteur.search'))
          void this.updatePromptCounts().catch((error) => this.report(error));
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
      addCategory: () => this.addCategory(),
      approveCategory: (node) => this.approveCategory(node),
      editCategoryDescription: (node) => this.editCategoryDescription(node),
      renameCategory: async (node) => {
        this.renamingCategory = true;
        try {
          await this.renameCategory(node);
        } finally {
          this.renamingCategory = false;
        }
      },
      edit: (node) => this.edit(node),
      delete: (node) => this.remove(node),
      duplicate: (node) => this.duplicate(node),
      copy: (node) => this.copy(node),
      copyPrompt: (node) => this.copyPrompt(node),
      pastePrompt: (node) => this.pastePrompt(node),
      preview: (node) => this.preview(node),
      search: () => this.search(),
      searchActive: () => this.search(),
      openUserLibrary: () => this.openLibraryFolder('user'),
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
            if (
              this.renamingCategory &&
              [
                'renameCategory',
                'newPrompt',
                'duplicate',
                'copyPrompt',
                'pastePrompt',
                'addCategory',
                'approveCategory',
                'removeCategory',
                'editCategoryDescription',
              ].includes(name)
            )
              throw new Error('Finish the category rename before changing categories.');
            await action(node);
          } catch (error) {
            if (error instanceof vscode.CancellationError) return;
            this.report(error);
            throw error;
          }
        }),
      );
    this.disposables.push(
      vscode.commands.registerCommand('prompteur.openLibraryFolder', async (scope: unknown) => {
        try {
          await this.openLibraryFolder(scope);
        } catch (error) {
          this.report(error);
          throw error;
        }
      }),
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
    this.treeView.message = query.trim() ? `Filter: ${query.trim()}` : '';
    this.tree.refresh();
    const update = this.filterContextUpdate.then(async () => {
      await vscode.commands.executeCommand('setContext', 'prompteur.filterActive', !!query.trim());
    });
    this.filterContextUpdate = update.catch(() => undefined);
    return Promise.all([update, this.updatePromptCounts()]).then(() => undefined);
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

  private async openLibraryFolder(scope: unknown): Promise<void> {
    if (scope !== 'user' && scope !== 'workspace') throw new Error('Invalid library folder link');
    const root = this.roots.get(scope);
    if (!root) throw new Error('Workspace library is unavailable');
    await vscode.workspace.fs.stat(root);
    await vscode.commands.executeCommand('revealFileInOS', root);
  }

  private uri(entry: Pick<Entry, 'scope' | 'path'>): vscode.Uri {
    return vscode.Uri.joinPath(this.roots.get(entry.scope)!, entry.path);
  }

  private isDestination(editor: vscode.TextEditor): boolean {
    return (
      !editor.document.isClosed &&
      !this.editor.contains(editor.document.uri) &&
      !this.editor.isPreview(editor.document)
    );
  }

  private destination(): vscode.TextEditor | undefined {
    const active = vscode.window.activeTextEditor;
    if (active && this.isDestination(active)) return active;
    return this.target && this.isDestination(this.target) ? this.target : undefined;
  }

  private async scope(node?: TreeNode): Promise<Scope | undefined> {
    if (node && node.kind !== 'root') return node.scope;
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
      validateInput: (input) => this.validateNewCategory(input),
    });
    if (!value?.trim()) return undefined;
    const category = value.trim().toLowerCase();
    return this.approveCategoryName(category);
  }

  private async approveCategory(node?: TreeNode): Promise<void> {
    if (node?.kind !== 'problem' || !this.roots.has(node.scope))
      throw new Error('Choose a prompt with an unapproved category');
    const snapshot = await this.service.get(node.scope);
    if (!snapshot.problems.some((problem) => problem.path === node.path))
      throw new Error('Prompt problem changed. Reload the library.');
    await this.service.refresh(node.scope, node.path);
    const problem = (await this.service.get(node.scope)).problems.find(
      (candidate) => candidate.path === node.path,
    );
    if (!problem?.unapprovedCategory)
      throw new Error('Prompt no longer has an unapproved category. Reload or repair its YAML.');
    const category = problem.unapprovedCategory;
    if (category === addCategoryValue || category === removeCategoryValue)
      throw new Error('Category name is reserved. Change the category in the prompt YAML.');
    await this.approveCategoryName(category);
  }

  private async approveCategoryName(category: string): Promise<string | undefined> {
    const description = await this.inputCategoryDescription(category);
    if (description === undefined) return undefined;
    const answer = await vscode.window.showWarningMessage(
      `Add "${category}" to this VS Code profile's User and Workspace categories?`,
      { modal: true },
      'Add Category',
    );
    if (answer !== 'Add Category') return undefined;

    const categories = new Set(this.approvedCategories).add(category);
    const descriptions = new Map(this.categoryDescriptions);
    if (description) descriptions.set(category, description);
    await this.saveCategories(categories, descriptions);
    for (const scope of this.roots.keys()) {
      try {
        await this.service.refresh(scope);
      } catch (error) {
        this.report(error);
      }
    }
    return category;
  }

  private async inputCategoryDescription(category: string): Promise<string | undefined> {
    const value = await vscode.window.showInputBox({
      title: `Description for ${category}`,
      prompt: `Optional category help; leave blank for generic help (maximum ${categoryDescriptionLimit} characters)`,
      value: this.categoryDescriptions.get(category) ?? '',
      validateInput: (input) =>
        /[\r\n]/.test(input)
          ? 'Description must be a single line'
          : input.trim().length > categoryDescriptionLimit
            ? `Description must be ${categoryDescriptionLimit} characters or fewer`
            : undefined,
    });
    return value?.trim();
  }

  private validateNewCategory(input: string): string | undefined {
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
  }

  private async pickCustomCategory(node: TreeNode | undefined, title: string) {
    if (node) {
      if (node.kind !== 'category' || !this.approvedCategories.has(node.category.toLowerCase()))
        throw new Error('Only approved custom categories can be edited');
      return node.category.toLowerCase();
    }
    const categories = [...this.approvedCategories].sort((left, right) =>
      left.localeCompare(right),
    );
    if (!categories.length) {
      void vscode.window.showInformationMessage('No approved custom categories to edit.');
      return undefined;
    }
    return (
      await vscode.window.showQuickPick(
        categories.map((value) => ({
          label: value.charAt(0).toUpperCase() + value.slice(1),
          value,
          description: this.categoryDescriptions.get(value) ?? '',
        })),
        { title },
      )
    )?.value;
  }

  private async editCategoryDescription(node?: TreeNode): Promise<void> {
    const category = await this.pickCustomCategory(node, 'Edit category description');
    if (!category) return;
    const description = await this.inputCategoryDescription(category);
    if (description === undefined) return;
    const descriptions = new Map(this.categoryDescriptions);
    if (description) descriptions.set(category, description);
    else descriptions.delete(category);
    await this.context.globalState.update(
      categoryDescriptionsStateKey,
      Object.fromEntries(descriptions),
    );
    this.categoryDescriptions = descriptions;
    this.tree.refresh();
  }

  private async renameCategory(node?: TreeNode): Promise<void> {
    const category = await this.pickCustomCategory(node, 'Rename prompt category');
    if (!category) return;
    const input = await vscode.window.showInputBox({
      title: 'Rename prompt category',
      prompt: 'New category name for both libraries',
      value: category,
      validateInput: (value) => this.validateNewCategory(value),
    });
    if (input === undefined) return;
    const next = input.trim().toLowerCase();
    const invalid = this.validateNewCategory(next);
    if (invalid) throw new Error(invalid);
    const affected = await this.categoryEntries(category);
    await this.assertNoDirtyDocumentsForCategory(category, 'renaming');
    for (const entry of affected) this.assertCategoryWritable(entry);
    if (
      (await vscode.window.showWarningMessage(
        `Rename "${category}" to "${next}" in this profile and ${affected.length} saved prompt(s) across User and Workspace? Prompt filenames and category description stay unchanged.`,
        { modal: true },
        'Rename Category',
      )) !== 'Rename Category'
    )
      return;
    if (!this.approvedCategories.has(category) || this.validateNewCategory(next))
      throw new Error('Categories changed. Retry the rename.');
    const current = await this.categoryEntries(category);
    const previousSources = new Map(affected.map((entry) => [entry.key, entry.source]));
    if (
      current.length !== affected.length ||
      current.some((entry) => previousSources.get(entry.key) !== entry.source)
    )
      throw new Error('Prompts changed. Retry the rename.');
    for (const entry of current) this.assertCategoryWritable(entry);
    await this.assertNoDirtyDocumentsForCategory(category, 'renaming');
    const previousCategories = new Set(this.approvedCategories);
    const previousDescriptions = new Map(this.categoryDescriptions);
    const categories = new Set(previousCategories).add(next);
    const descriptions = new Map(previousDescriptions);
    const description = descriptions.get(category);
    if (description) descriptions.set(next, description);
    const changes = current.map((entry) => ({
      entry,
      source: encodeMarkdown({ ...entry.data, category: next }, entry.source, [...categories]),
    }));
    await this.saveCategories(categories, descriptions);
    const attempted: typeof changes = [];
    try {
      for (const change of changes) {
        this.assertCategoryWritable(change.entry);
        attempted.push(change);
        await this.service.writeSource(
          change.entry.scope,
          change.entry.path,
          change.source,
          change.entry.source,
        );
      }
      if ((await this.categoryEntries(category)).length)
        throw new Error('Prompts changed during rename. Retry the rename.');
      categories.delete(category);
      descriptions.delete(category);
      await this.saveCategories(categories, descriptions);
    } catch (error) {
      const failures: string[] = [];
      for (const { entry, source } of attempted.reverse()) {
        try {
          const saved = await this.service.readFile(entry.scope, entry.path);
          if (saved === entry.source) continue;
          if (saved !== source) throw new Error('File changed during rename');
          this.assertCategoryWritable(entry);
          await this.service.writeSource(entry.scope, entry.path, entry.source, source);
        } catch (rollbackError) {
          failures.push(`${entry.scope}/${entry.path}: ${messageOf(rollbackError)}`);
        }
      }
      if (!failures.length) {
        try {
          await this.saveCategories(previousCategories, previousDescriptions);
        } catch (rollbackError) {
          failures.push(`Profile metadata: ${messageOf(rollbackError)}`);
        }
      }
      throw new Error(
        `Category rename failed: ${messageOf(error)}. ${
          failures.length
            ? `Recovery incomplete; both categories remain approved. Check affected prompts: ${failures.join('; ')}`
            : 'Original prompts and category metadata restored.'
        }`,
      );
    }
    if (this.copiedPrompt?.data.category === category)
      this.copiedPrompt = {
        ...this.copiedPrompt,
        data: { ...this.copiedPrompt.data, category: next },
      };
    void vscode.window.showInformationMessage(
      `Renamed "${category}" to "${next}" in ${changes.length} prompt(s).`,
    );
  }

  private async categoryEntries(category: string): Promise<Entry[]> {
    const entries: Entry[] = [];
    for (const scope of this.roots.keys()) {
      await this.service.refresh(scope);
      const snapshot = await this.service.get(scope);
      if (snapshot.problems.length)
        throw new Error('Repair invalid prompts in both libraries before renaming a category.');
      entries.push(...snapshot.entries.filter((entry) => entry.data.category === category));
    }
    return entries;
  }

  private assertCategoryWritable(entry: Entry): void {
    this.assertTrusted(entry);
    const uri = this.uri(entry).toString();
    if (
      vscode.workspace.textDocuments.some(
        (document) => document.uri.toString() === uri && document.isDirty,
      )
    )
      throw new Error(`Save or discard unsaved changes before renaming: ${entry.path}`);
  }

  private async assertNoDirtyDocumentsForCategory(
    category: string,
    action: 'renaming' | 'removing',
  ): Promise<void> {
    const allowedCategories = this.allowedCategories();
    for (const document of vscode.workspace.textDocuments) {
      if (!document.isDirty) continue;
      const location = await this.editor.locate(document.uri);
      if (!location) continue;
      const source = document.getText();
      if (Buffer.byteLength(source, 'utf8') > documentByteLimit) continue;
      let data: PromptData;
      try {
        data = decodeMarkdown(source, allowedCategories);
      } catch (error) {
        if (error instanceof PromptDocumentError) continue;
        throw error;
      }
      if (data.category === category)
        throw new Error(`Save or discard unsaved changes before ${action}: ${location.path}`);
    }
  }

  private async assertCategoryUnused(category: string): Promise<void> {
    let usageCount = 0;
    for (const scope of this.roots.keys()) {
      await this.service.refresh(scope);
      usageCount += (await this.service.get(scope)).entries.filter(
        (entry) => entry.data.category === category,
      ).length;
    }
    if (!usageCount) return;
    const promptNoun = usageCount === 1 ? 'prompt' : 'prompts';
    const promptVerb = usageCount === 1 ? 'uses' : 'use';
    throw new Error(
      `Cannot remove "${category}" while ${usageCount} ${promptNoun} ${promptVerb} it. Reassign them first.`,
    );
  }

  private async saveCategories(
    categories: Set<string>,
    descriptions: Map<string, string>,
  ): Promise<void> {
    const previousDescriptions = this.context.globalState.get<unknown>(
      categoryDescriptionsStateKey,
    );
    await this.context.globalState.update(
      categoryDescriptionsStateKey,
      Object.fromEntries(descriptions),
    );
    try {
      await this.context.globalState.update(
        'approvedPromptCategories',
        [...categories].sort((left, right) => left.localeCompare(right)),
      );
    } catch (error) {
      try {
        await this.context.globalState.update(categoryDescriptionsStateKey, previousDescriptions);
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `Category save failed: ${messageOf(error)}. Description rollback failed: ${messageOf(rollbackError)}`,
        );
      }
      throw error;
    }
    this.approvedCategories.clear();
    for (const category of categories) this.approvedCategories.add(category);
    this.categoryDescriptions = new Map(descriptions);
    this.tree.refresh();
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

    await this.assertCategoryUnused(choice.value);
    await this.assertNoDirtyDocumentsForCategory(choice.value, 'removing');

    const answer = await vscode.window.showWarningMessage(
      `Remove "${choice.value}" from this VS Code profile's approved categories?`,
      { modal: true },
      'Remove Category',
    );
    if (answer !== 'Remove Category') return;

    await this.assertCategoryUnused(choice.value);
    await this.assertNoDirtyDocumentsForCategory(choice.value, 'removing');
    const categoriesAfterRemoval = new Set(this.approvedCategories);
    categoriesAfterRemoval.delete(choice.value);
    const descriptions = new Map(this.categoryDescriptions);
    descriptions.delete(choice.value);
    await this.saveCategories(categoriesAfterRemoval, descriptions);
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
    if (this.searchBox) {
      this.searchBox.show();
      return;
    }
    const box = vscode.window.createInputBox();
    box.title = 'Filter prompts (tag:value, category:value)';
    box.value = this.tree.query;
    this.searchBox = box;
    const listeners: vscode.Disposable[] = [];
    const cleanup = () => {
      if (this.searchBox !== box) return;
      this.searchBox = undefined;
      this.disposeSearch = undefined;
      for (const listener of listeners) listener.dispose();
      box.dispose();
    };
    this.disposeSearch = cleanup;
    listeners.push(
      box.onDidChangeValue((value) => {
        void this.setFilter(value).catch((error) => this.report(error));
      }),
      box.onDidAccept(() => box.hide()),
      box.onDidHide(cleanup),
    );
    try {
      box.show();
    } catch (error) {
      cleanup();
      throw error;
    }
  }

  async initialize(): Promise<void> {
    void this.updatePromptCounts().catch((error) => this.report(error));
    // Initial sync runs in the background so activation stays within its time budget.
    // Operations are serialized by UserPromptSync's queue, so later persist calls remain ordered.
    void this.configurePromptSync().catch((error) => this.report(error));
    this.disposables.push({
      dispose: this.service.subscribe((scope) => {
        void this.updatePromptCounts().catch((error) => this.report(error));
        if (scope === 'user')
          void this.userPromptSync.persist().catch((error) => this.report(error));
      }),
    });
    for (const [scope, root] of this.roots)
      this.disposables.push(watchLibrary(root, scope, this.service, (error) => this.report(error)));
  }

  private async updatePromptCounts(): Promise<void> {
    if (this.disposed) return;
    const update = ++this.countUpdate;
    try {
      const counts = await Promise.all(
        [...this.roots.keys()].map(async (scope) => {
          const entries = await this.service.search(scope, this.tree.query);
          const snapshot = await this.service.get(scope);
          return [scope, { filtered: entries.length, total: snapshot.entries.length }] as const;
        }),
      );
      if (update !== this.countUpdate) return;
      for (const [scope, count] of counts) {
        this.scopeCounts.set(scope, count);
      }
      this.tree.refresh();
    } catch (error) {
      if (update === this.countUpdate) {
        this.scopeCounts.clear();
        this.tree.refresh();
      }
      throw error;
    }
  }

  private async expandLibraryScopes(): Promise<void> {
    const options = { expand: true, select: false };
    for (const scope of this.roots.keys())
      await this.treeView.reveal({ kind: 'scope', scope }, options);
  }

  private async configurePromptSync(): Promise<void> {
    const enabled = vscode.workspace
      .getConfiguration('prompteur')
      .get<boolean>('syncUserPrompts', true);
    await this.userPromptSync.configure(enabled);
    if (enabled) await this.service.refresh('user');
  }

  dispose(): void {
    this.disposed = true;
    ++this.countUpdate;
    this.disposeSearch?.();
    for (const disposable of this.disposables.reverse()) disposable.dispose();
  }
}

export async function start(context: vscode.ExtensionContext): Promise<void> {
  await vscode.commands.executeCommand('setContext', 'prompteur.hasCopiedPrompt', false);
  await vscode.commands.executeCommand('setContext', 'prompteur.filterActive', false);
  const workbench = new Workbench(context);
  context.subscriptions.push(workbench);
  await workbench.initialize();
}
