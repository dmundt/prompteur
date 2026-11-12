import * as vscode from 'vscode';
import { documentByteLimit } from '../core/limits';

export class TextInput implements vscode.Disposable {
  private cancelPending: (() => void) | undefined;

  request(token?: vscode.CancellationToken): Promise<string> {
    if (token?.isCancellationRequested) return Promise.reject(new vscode.CancellationError());
    if (this.cancelPending)
      return Promise.reject(new Error('A prompt text input is already pending.'));
    return new Promise<string>((resolve, reject) => {
      const box = vscode.window.createInputBox();
      const disposables: vscode.Disposable[] = [];
      let finished = false;
      const finish = (text?: string, error?: unknown) => {
        if (finished) return;
        finished = true;
        this.cancelPending = undefined;
        for (const disposable of disposables) disposable.dispose();
        box.dispose();
        if (error !== undefined) reject(error);
        else resolve(text!);
      };
      this.cancelPending = () => finish(undefined, new vscode.CancellationError());
      box.title = 'Enter prompt text';
      box.prompt = 'Enter a single line of text for this prompt.';
      disposables.push(
        box.onDidChangeValue(() => {
          box.validationMessage = undefined;
        }),
        box.onDidAccept(() => {
          const text = box.value;
          if (!text.trim()) box.validationMessage = 'Enter non-empty prompt text.';
          else if (/[\r\n]/.test(text)) box.validationMessage = 'Enter a single line of text.';
          else if (Buffer.byteLength(text, 'utf8') > documentByteLimit)
            box.validationMessage = `Input exceeds ${documentByteLimit} byte limit`;
          else finish(text);
        }),
        box.onDidHide(() => this.cancelPending?.()),
      );
      if (token) {
        disposables.push(token.onCancellationRequested(() => this.cancelPending?.()));
        if (token.isCancellationRequested) {
          this.cancelPending?.();
          return;
        }
      }
      try {
        box.show();
      } catch (error) {
        finish(undefined, error);
      }
    });
  }

  dispose(): void {
    this.cancelPending?.();
  }
}
