import * as vscode from 'vscode';
import { decodeYaml, type Entry, type Scope, promptFolder } from '../core/documents';
import { variableTokens } from '../core/render';
import { LibraryService, messageOf } from '../application/library';

export interface Location {
  scope: Scope;
  path: string;
}
export class NativeEditor implements vscode.Disposable {
  readonly diagnostics = vscode.languages.createDiagnosticCollection('prompteur');
  private readonly decoration = vscode.window.createTextEditorDecorationType({
    color: new vscode.ThemeColor('symbolIcon.variableForeground'),
    fontWeight: 'bold',
  });
  private readonly disposables: vscode.Disposable[] = [this.diagnostics, this.decoration];
  private readonly previews = new WeakSet<vscode.TextDocument>();

  constructor(
    private readonly service: LibraryService,
    private readonly roots: ReadonlyMap<Scope, vscode.Uri>,
  ) {
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        void this.validate(document);
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        void this.validate(event.document);
      }),
      vscode.workspace.onDidCloseTextDocument((document) => this.diagnostics.delete(document.uri)),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) void this.validate(editor.document);
      }),
    );
    const unsubscribe = service.subscribe(() => {
      for (const document of vscode.workspace.textDocuments) void this.validate(document);
    });
    this.disposables.push({ dispose: unsubscribe });
  }

  async locate(uri: vscode.Uri): Promise<Location | undefined> {
    for (const [scope, root] of this.roots) {
      if (uri.scheme !== root.scheme || !uri.path.startsWith(`${root.path}/`)) continue;
      const path = uri.path.slice(root.path.length + 1);
      if (!/\.ya?ml$/i.test(path)) return undefined;
      if (path.startsWith(`${promptFolder}/`)) return { scope, path };
    }
    return undefined;
  }

  contains(uri: vscode.Uri): boolean {
    return [...this.roots.values()].some(
      (root) => uri.scheme === root.scheme && uri.path.startsWith(`${root.path}/`),
    );
  }

  async live(entry: Entry): Promise<Entry> {
    const root = this.roots.get(entry.scope)!;
    const uri = vscode.Uri.joinPath(root, entry.path);
    const document = vscode.workspace.textDocuments.find(
      (item) => item.uri.toString() === uri.toString() && item.isDirty,
    );
    if (!document) return entry;
    const source = document.getText();
    return { ...entry, source, data: decodeYaml(source) };
  }

  private async validate(document: vscode.TextDocument): Promise<void> {
    try {
      const location = await this.locate(document.uri);
      if (!location) return;
      const source = document.getText();
      const data = decodeYaml(source);
      variableTokens(data.content);
      this.diagnostics.set(document.uri, []);
      const ranges = [
        ...source.matchAll(/{{\s*(selection|clipboard|filename|workspace)\s*}}/g),
      ].map(
        (match) =>
          new vscode.Range(
            document.positionAt(match.index),
            document.positionAt(match.index + match[0].length),
          ),
      );
      for (const editor of vscode.window.visibleTextEditors)
        if (editor.document === document) editor.setDecorations(this.decoration, ranges);
    } catch (error) {
      this.diagnostics.set(document.uri, [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 1),
          messageOf(error),
          vscode.DiagnosticSeverity.Error,
        ),
      ]);
    }
  }

  markPreview(document: vscode.TextDocument): void {
    this.previews.add(document);
  }

  isPreview(document: vscode.TextDocument): boolean {
    return this.previews.has(document);
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }
}
