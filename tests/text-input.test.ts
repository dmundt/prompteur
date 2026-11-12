import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextInput } from '../src/workbench/text-input';
import { documentByteLimit } from '../src/core/limits';
import {
  CancellationError,
  contextKeys,
  EventEmitter,
  messages,
  reset,
  window,
  workspace,
} from './vscode-mock';

afterEach(() => {
  vi.restoreAllMocks();
  reset();
});

async function openedInput() {
  await vi.waitFor(() => expect(window.activeTextEditor).toBeDefined());
  return window.activeTextEditor!.document;
}

describe('multiline prompt input', () => {
  it('accepts multiline text once and validates blank and oversized input', async () => {
    const input = new TextInput();
    const result = input.request();
    const document = await openedInput();
    expect(contextKeys.get('prompteur.textInputDocuments')).toEqual([document.uri.toString()]);
    const other = await workspace.openTextDocument({
      language: 'plaintext',
      content: 'Other editor',
    });
    await window.showTextDocument(other);
    await expect(input.submit()).rejects.toThrow('pending prompt text editor');
    await window.showTextDocument(document);
    document.change(' \n ');
    await input.submit();
    expect(messages.warnings.at(-1)).toContain('non-empty');
    document.change('x'.repeat(documentByteLimit + 1));
    await expect(input.submit()).rejects.toThrow('byte limit');
    document.change('First line\nSecond line');
    await input.submit();
    expect(await result).toBe('First line\nSecond line');
    expect(contextKeys.get('prompteur.textInputDocuments')).toEqual([]);
    input.dispose();
  });

  it('rejects concurrent requests and cancels when the input closes', async () => {
    const input = new TextInput();
    const result = input.request();
    const cancelled = expect(result).rejects.toBeInstanceOf(CancellationError);
    const document = await openedInput();
    await expect(input.request()).rejects.toThrow('already pending');
    document.close();
    await cancelled;
    expect(contextKeys.get('prompteur.textInputDocuments')).toEqual([]);
    input.dispose();
  });

  it('cancels through invocation token and disposal', async () => {
    const input = new TextInput();
    const cancellation = new EventEmitter<void>();
    const result = input.request({
      isCancellationRequested: false,
      onCancellationRequested: cancellation.event,
    });
    const cancelled = expect(result).rejects.toBeInstanceOf(CancellationError);
    await openedInput();
    cancellation.fire();
    await cancelled;
    const next = input.request();
    const disposed = expect(next).rejects.toBeInstanceOf(CancellationError);
    input.dispose();
    await disposed;
    await expect(
      input.request({ isCancellationRequested: true, onCancellationRequested: cancellation.event }),
    ).rejects.toBeInstanceOf(CancellationError);
  });

  it('rejects editor failures and restores availability for the next request', async () => {
    const input = new TextInput();
    vi.spyOn(workspace, 'openTextDocument').mockRejectedValueOnce(new Error('Editor unavailable'));
    await expect(input.request()).rejects.toThrow('Editor unavailable');
    const result = input.request();
    const cancelled = expect(result).rejects.toBeInstanceOf(CancellationError);
    await openedInput();
    input.cancel();
    await cancelled;
    input.dispose();
  });
});
