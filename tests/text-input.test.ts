import { afterEach, describe, expect, it, vi } from 'vitest';
import { TextInput } from '../src/workbench/text-input';
import { documentByteLimit } from '../src/core/limits';
import { CancellationError, EventEmitter, inputBoxes, reset, window } from './vscode-mock';

afterEach(() => {
  vi.restoreAllMocks();
  reset();
});

describe('single-line prompt input', () => {
  it('accepts text and validates blank, multiline, and oversized input', async () => {
    const input = new TextInput();
    const result = input.request();
    const box = inputBoxes.at(-1)!;
    expect(box.title).toBe('Enter prompt text');
    for (const [value, message] of [
      ['  ', 'non-empty'],
      ['one\ntwo', 'single line'],
      ['x'.repeat(documentByteLimit + 1), 'byte limit'],
    ]) {
      box.value = value!;
      box.accepted.fire();
      expect(box.validationMessage).toContain(message);
      box.valueChanged.fire(value!);
      expect(box.validationMessage).toBeUndefined();
    }
    box.value = 'User text';
    box.accepted.fire();
    expect(await result).toBe('User text');
    input.dispose();
  });

  it('rejects concurrent requests and cancels when hidden', async () => {
    const input = new TextInput();
    const result = input.request();
    const cancelled = expect(result).rejects.toBeInstanceOf(CancellationError);
    await expect(input.request()).rejects.toThrow('already pending');
    inputBoxes.at(-1)!.hide();
    await cancelled;
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

  it('rejects input failures and restores availability for the next request', async () => {
    const input = new TextInput();
    vi.spyOn(window, 'createInputBox').mockImplementationOnce(() => {
      throw new Error('Input unavailable');
    });
    await expect(input.request()).rejects.toThrow('Input unavailable');
    const result = input.request();
    const cancelled = expect(result).rejects.toBeInstanceOf(CancellationError);
    inputBoxes.at(-1)!.hide();
    await cancelled;
    input.dispose();
  });
});
