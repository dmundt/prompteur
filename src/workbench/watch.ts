import * as vscode from 'vscode';
import { LibraryService } from '../application/library';
import { promptFolder, type Scope } from '../core/documents';

export function watchLibrary(
  root: vscode.Uri,
  scope: Scope,
  service: LibraryService,
  report: (error: unknown) => void,
): vscode.Disposable {
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(root, `${promptFolder}/**/*`),
  );
  const disposables: vscode.Disposable[] = [watcher];
  const pending = new Set<string>();
  let full = false;
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (uri: vscode.Uri, structure: boolean): void => {
    const path = uri.path.slice(root.path.length + 1);
    if (path.endsWith('.lock') || path.endsWith('.tmp')) return;
    pending.add(path);
    full ||= structure;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      const paths = [...pending];
      const reload = full;
      pending.clear();
      full = false;
      if (disposed) return;
      const operation = reload ? service.refresh(scope) : service.refreshMany(scope, paths);
      void operation.catch(report);
    }, 80);
  };
  disposables.push(
    watcher.onDidChange((uri) => schedule(uri, false)),
    watcher.onDidCreate((uri) => schedule(uri, true)),
    watcher.onDidDelete((uri) => schedule(uri, true)),
  );
  return {
    dispose: () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      for (const disposable of disposables) disposable.dispose();
    },
  };
}
