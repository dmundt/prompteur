import * as vscode from 'vscode';
import { assertTextBudget, documentByteLimit } from '../core/limits';

interface PendingInput {
  document?: vscode.TextDocument;
  resolve: (text: string) => void;
  reject: (error: unknown) => void;
  disposables: vscode.Disposable[];
  finishing?: boolean;
}

export class TextInput implements vscode.Disposable {
  private pending: PendingInput | undefined;
  private readonly documents = new WeakSet<vscode.TextDocument>();

  contains(document: vscode.TextDocument): boolean {
    return this.documents.has(document);
  }

  request(token?: vscode.CancellationToken): Promise<string> {
    if (token?.isCancellationRequested) return Promise.reject(new vscode.CancellationError());
    if (this.pending) return Promise.reject(new Error('A prompt text input is already pending.'));
    return new Promise<string>((resolve, reject) => {
      const pending: PendingInput = { resolve, reject, disposables: [] };
      this.pending = pending;
      if (token) pending.disposables.push(token.onCancellationRequested(() => this.cancel()));
      pending.disposables.push(
        vscode.workspace.onDidCloseTextDocument((document) => {
          if (document === pending.document) this.cancel();
        }),
      );
      void this.open(pending).catch((error) => this.finish(pending, undefined, error));
    });
  }

  private async open(pending: PendingInput): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
      language: 'plaintext',
      content: '',
    });
    this.documents.add(document);
    if (this.pending !== pending || pending.finishing) return;
    pending.document = document;
    await vscode.commands.executeCommand('setContext', 'prompteur.textInputDocuments', [
      document.uri.toString(),
    ]);
    if (this.pending !== pending || pending.finishing) return;
    await vscode.window.showTextDocument(document, { preview: false });
    if (this.pending !== pending || pending.finishing) return;
    void vscode.window.showInformationMessage(
      'Enter prompt text, then choose Use Text or Cancel in the editor toolbar.',
    );
  }

  async submit(): Promise<void> {
    const pending = this.pending;
    const document = pending?.document;
    if (!pending || !document || vscode.window.activeTextEditor?.document !== document)
      throw new Error('Open the pending prompt text editor before using its text.');
    const text = document.getText();
    if (!text.trim()) {
      void vscode.window.showWarningMessage(
        'Enter non-empty prompt text before choosing Use Text.',
      );
      return;
    }
    assertTextBudget(text, documentByteLimit);
    await this.finish(pending, text);
  }

  cancel(): Promise<void> {
    return this.pending
      ? this.finish(this.pending, undefined, new vscode.CancellationError())
      : Promise.resolve();
  }

  private async finish(pending: PendingInput, text?: string, error?: unknown): Promise<void> {
    if (this.pending !== pending || pending.finishing) return;
    pending.finishing = true;
    for (const disposable of pending.disposables) disposable.dispose();
    try {
      await vscode.commands.executeCommand('setContext', 'prompteur.textInputDocuments', []);
    } catch (contextError) {
      pending.reject(contextError);
      return;
    } finally {
      this.pending = undefined;
    }
    if (error !== undefined) pending.reject(error);
    else pending.resolve(text!);
  }

  dispose(): void {
    void this.cancel();
  }
}
