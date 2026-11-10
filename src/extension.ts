import * as vscode from 'vscode';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const { start } = await import('./workbench/start');
  start(context);
}
