import * as vscode from 'vscode';
import { LibraryService, messageOf } from '../application/library';
import type { Entry, Problem, PromptCategory, Scope } from '../core/documents';
import { variableTokens, type VariableKey } from '../core/render';

export type TreeNode =
  | { kind: 'scope'; scope: Scope }
  | {
      kind: 'category';
      scope: Scope;
      category: string;
      filteredCount?: number;
      totalCount?: number;
    }
  | { kind: 'entry'; scope: Scope; entry: Entry }
  | ({ kind: 'problem'; scope: Scope } & Problem)
  | { kind: 'batch'; scope: Scope; label: string; children: TreeNode[] };

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const escapeLinkLabel = (value: string): string =>
  value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/([`*_{}[\]<>|])/g, '\\$1');
const commandUri = (command: string, args: unknown[]): string =>
  `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
const contextLabels: Record<VariableKey, string> = {
  selection: 'Selection',
  clipboard: 'Clipboard',
  filename: 'Filename',
  workspace: 'Workspace',
  text: 'Text',
};
const categoryDescriptions = new Map<string, string>(
  Object.entries({
    explain: 'Understand code, behavior, and changes.',
    plan: 'Define requirements, scope, and implementation steps.',
    implement: 'Make scoped code changes.',
    review: 'Assess code, architecture, security, and readiness.',
    test: 'Design or add tests.',
    debug: 'Diagnose failures and investigate causes.',
    document: 'Write or improve documentation.',
  } satisfies Record<PromptCategory, string>),
);

export class PromptTree implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<TreeNode | undefined>();
  private readonly contextSummaries = new WeakMap<Entry, string>();
  readonly onDidChangeTreeData = this.changes.event;
  private readonly unsubscribe: () => void;
  query = '';

  constructor(
    private readonly service: LibraryService,
    private readonly workspaceAvailable: () => boolean,
    private readonly report: (error: unknown) => void,
    private readonly showTags: () => boolean = () => true,
    private readonly categoryCountMode: () => 'filtered' | 'total' | 'hidden' = () => 'filtered',
    private readonly groupByCategory: () => boolean = () => true,
    private readonly libraryRoot: (scope: Scope) => Pick<vscode.Uri, 'fsPath'> | undefined = () =>
      undefined,
    private readonly customCategoryDescription: (category: string) => string | undefined = () =>
      undefined,
  ) {
    this.unsubscribe = service.subscribe(() => this.refresh());
  }

  refresh(): void {
    this.changes.fire(undefined);
  }
  dispose(): void {
    this.unsubscribe();
    this.changes.dispose();
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    if (node.kind === 'scope') {
      const item = new vscode.TreeItem(
        node.scope === 'user' ? 'User' : 'Workspace',
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.id = node.scope;
      item.contextValue = 'scope';
      const tooltip = new vscode.MarkdownString();
      tooltip.appendText(
        node.scope === 'user'
          ? 'Prompts stored in this VS Code profile; optional VS Code Settings Sync.'
          : 'Prompts stored in the first workspace folder; writes, generation, and preview require Workspace Trust.',
      );
      const root = this.libraryRoot(node.scope);
      if (root) {
        tooltip.appendMarkdown(
          `\n\n[${escapeLinkLabel(root.fsPath)}](${commandUri('prompteur.openLibraryFolder', [node.scope])})`,
        );
        tooltip.isTrusted = { enabledCommands: ['prompteur.openLibraryFolder'] };
      }
      item.tooltip = tooltip;
      return item;
    }
    if (node.kind === 'batch')
      return new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
    if (node.kind === 'category') {
      const name = node.category.charAt(0).toUpperCase() + node.category.slice(1);
      const countMode = this.categoryCountMode();
      const count = countMode === 'total' ? node.totalCount : node.filteredCount;
      const visibleCount = countMode === 'hidden' ? undefined : count;
      const label = visibleCount === undefined ? name : `${name} (${visibleCount})`;
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `${node.scope}:category:${node.category.toLowerCase()}`;
      const description = this.customCategoryDescription(node.category.toLowerCase());
      item.contextValue = description === undefined ? 'category' : 'customCategory';
      if (description !== undefined) item.description = 'custom';
      item.tooltip =
        categoryDescriptions.get(node.category.trim().toLowerCase()) ??
        (description || 'User-defined category for organizing prompts.');
      return item;
    }
    if (node.kind === 'problem') {
      const item = new vscode.TreeItem(basename(node.path));
      item.contextValue = node.unapprovedCategory ? 'categoryProblem' : 'problem';
      item.tooltip = node.unapprovedCategory
        ? `${node.message}\nRight-click > Approve Prompt Category to use this category.`
        : node.message;
      item.iconPath = new vscode.ThemeIcon('warning');
      item.command = {
        command: 'prompteur.edit',
        title: 'Repair Markdown Prompt',
        arguments: [node],
      };
      return item;
    }
    const { entry } = node;
    const item = new vscode.TreeItem(entry.data.name);
    item.id = entry.key;
    item.contextValue = 'prompt';
    const tags = entry.data.tags.map((tag) => `#${tag}`).join(' ');
    if (this.showTags()) item.description = tags;
    const tooltip = new vscode.MarkdownString();
    if (entry.data.description) {
      tooltip.appendText(entry.data.description);
      tooltip.appendMarkdown('\n\n');
    }
    tooltip.appendText('Category: ');
    tooltip.appendMarkdown(
      `[${escapeLinkLabel(entry.data.category)}](${commandUri('prompteur.filterFromTooltip', [
        'category',
        entry.data.category,
      ])})`,
    );
    if (entry.data.tags.length) {
      tooltip.appendMarkdown('\n\nTags: ');
      tooltip.appendMarkdown(
        entry.data.tags
          .map(
            (tag) =>
              `[${escapeLinkLabel(`#${tag}`)}](${commandUri('prompteur.filterFromTooltip', [
                'tag',
                tag,
              ])})`,
          )
          .join(' '),
      );
    }
    let context = this.contextSummaries.get(entry);
    if (context === undefined) {
      try {
        const names = new Set(variableTokens(entry.data.content).map((token) => token.name));
        context = names.size
          ? `Context: ${[...names].map((name) => contextLabels[name]).join(', ')}`
          : '';
      } catch (error) {
        context = `Context unavailable: ${messageOf(error)}`;
      }
      this.contextSummaries.set(entry, context);
    }
    if (context) {
      tooltip.appendMarkdown('\n\n');
      tooltip.appendText(context);
    }
    tooltip.appendMarkdown(
      `\n\n[${escapeLinkLabel(entry.path)}](${commandUri('prompteur.openPromptPath', [entry.scope, entry.path])})`,
    );
    tooltip.isTrusted = {
      enabledCommands: ['prompteur.filterFromTooltip', 'prompteur.openPromptPath'],
    };
    item.tooltip = tooltip;
    item.command = { command: 'prompteur.edit', title: 'Edit', arguments: [node] };
    return item;
  }

  async getChildren(node?: TreeNode): Promise<TreeNode[]> {
    try {
      if (!node)
        return (this.workspaceAvailable() ? ['user', 'workspace'] : ['user']).map((scope) => ({
          kind: 'scope',
          scope: scope as Scope,
        }));
      if (node.kind === 'batch') return node.children;
      if (node.kind !== 'scope' && node.kind !== 'category') return [];
      const snapshot = await this.service.get(node.scope);
      const entries = await this.service.search(
        node.scope,
        this.query,
        node.kind === 'category' ? node.category : undefined,
      );
      let nodes: TreeNode[];
      if (node.kind === 'scope' && this.groupByCategory()) {
        const countByCategory = (source: readonly Entry[]) => {
          const counts = new Map<string, number>();
          for (const entry of source) {
            const key = (entry.data.category.trim() || 'misc').toLowerCase();
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
          return counts;
        };
        const filteredCounts = countByCategory(entries);
        const totalCounts = countByCategory(snapshot.entries);
        nodes = Array.from(
          new Map(
            entries
              .map((entry) => entry.data.category.trim() || 'misc')
              .map((category) => [category.toLowerCase(), category] as const),
          ).values(),
        )
          .sort((left, right) => left.localeCompare(right))
          .map((category): TreeNode => ({
            kind: 'category',
            scope: node.scope,
            category,
            filteredCount: filteredCounts.get(category.toLowerCase()) ?? 0,
            totalCount: totalCounts.get(category.toLowerCase()) ?? 0,
          }));
      } else {
        nodes = entries.map((entry): TreeNode => ({
          kind: 'entry',
          scope: node.scope,
          entry,
        }));
      }
      if (node.kind === 'scope')
        nodes.push(
          ...snapshot.problems.map((problem): TreeNode => ({
            kind: 'problem',
            scope: node.scope,
            ...problem,
          })),
        );
      if (nodes.length <= 200) return nodes;
      return Array.from({ length: Math.ceil(nodes.length / 200) }, (_, index) => ({
        kind: 'batch',
        scope: node.scope,
        label: `${index * 200 + 1}-${Math.min((index + 1) * 200, nodes.length)}`,
        children: nodes.slice(index * 200, (index + 1) * 200),
      }));
    } catch (error) {
      this.report(messageOf(error));
      return [];
    }
  }
}
