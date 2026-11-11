import * as vscode from 'vscode';
import { LibraryService, messageOf } from '../application/library';
import type { Entry, Scope } from '../core/documents';

export type TreeNode =
  | { kind: 'scope'; scope: Scope }
  | { kind: 'category'; scope: Scope; category: string }
  | { kind: 'entry'; scope: Scope; entry: Entry }
  | { kind: 'problem'; scope: Scope; path: string; message: string }
  | { kind: 'batch'; scope: Scope; label: string; children: TreeNode[] };

const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

export class PromptTree implements vscode.TreeDataProvider<TreeNode>, vscode.Disposable {
  private readonly changes = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.changes.event;
  private readonly unsubscribe: () => void;
  query = '';

  constructor(
    private readonly service: LibraryService,
    private readonly workspaceAvailable: () => boolean,
    private readonly report: (error: unknown) => void,
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
      item.iconPath = new vscode.ThemeIcon(node.scope === 'user' ? 'person' : 'root-folder');
      return item;
    }
    if (node.kind === 'batch')
      return new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
    if (node.kind === 'category') {
      const label = node.category.charAt(0).toUpperCase() + node.category.slice(1);
      const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `${node.scope}:category:${node.category.toLowerCase()}`;
      item.contextValue = 'category';
      return item;
    }
    if (node.kind === 'problem') {
      const item = new vscode.TreeItem(basename(node.path));
      item.contextValue = 'problem';
      item.tooltip = node.message;
      item.iconPath = new vscode.ThemeIcon('warning');
      item.command = { command: 'prompteur.edit', title: 'Repair YAML', arguments: [node] };
      return item;
    }
    const { entry } = node;
    const item = new vscode.TreeItem(entry.data.name);
    item.id = entry.key;
    item.contextValue = 'prompt';
    const tags = entry.data.tags.map((tag) => `#${tag}`).join(' ');
    item.description = tags;
    item.tooltip = [
      entry.data.description,
      `Category: ${entry.data.category}`,
      tags ? `Tags: ${tags}` : '',
      entry.path,
    ]
      .filter(Boolean)
      .join('\n');
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
      const nodes: TreeNode[] =
        node.kind === 'scope'
          ? [
              ...Array.from(
                new Map(
                  entries
                    .map((entry) => entry.data.category.trim() || 'misc')
                    .map((category) => [category.toLowerCase(), category] as const),
                ).values(),
              )
                .sort((left, right) => left.localeCompare(right))
                .map((category): TreeNode => ({ kind: 'category', scope: node.scope, category })),
            ]
          : entries.map((entry): TreeNode => ({ kind: 'entry', scope: node.scope, entry }));
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
