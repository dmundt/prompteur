import { describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import { LibraryService } from '../src/application/library';
import { encodeMarkdown, newPrompt } from '../src/core/documents';
import { PromptLibraryTool } from '../src/workbench/prompt-tool';
import { memoryFiles } from './helpers';
import { CancellationError, Disposable } from './vscode-mock';

describe('Copilot prompt tool asynchronous boundaries', () => {
  it.each(['query', 'path'] as const)(
    'rechecks cancellation and Workspace Trust after %s lookup',
    async (mode) => {
      for (const interruption of ['cancel', 'trust'] as const) {
        const { port, files } = memoryFiles();
        files.set('workspace:prompts/review.prompt.md', encodeMarkdown(newPrompt('Review')));
        const service = new LibraryService(port);
        let release!: () => void;
        let started!: () => void;
        const pending = new Promise<void>((resolve) => {
          release = resolve;
        });
        const lookupStarted = new Promise<void>((resolve) => {
          started = resolve;
        });
        const list = vi.mocked(port.list);
        const original = list.getMockImplementation()!;
        list.mockImplementation(async (scope) => {
          started();
          await pending;
          return original(scope);
        });
        let trusted = true;
        let cancelled = false;
        const token = {
          get isCancellationRequested() {
            return cancelled;
          },
          onCancellationRequested: () => new Disposable(),
        } satisfies vscode.CancellationToken;
        const render = vi.fn(async () => ({ text: 'Private content', missing: [] }));
        const tool = new PromptLibraryTool(
          service,
          () => true,
          () => trusted,
          render,
        );
        const input =
          mode === 'query'
            ? ({ query: 'Review', scope: 'workspace' } as const)
            : ({ scope: 'workspace', path: 'prompts/review.prompt.md' } as const);
        const result = tool.invoke({ input, toolInvocationToken: undefined }, token);
        await lookupStarted;
        if (interruption === 'cancel') cancelled = true;
        else trusted = false;
        release();
        if (interruption === 'cancel')
          await expect(result).rejects.toBeInstanceOf(CancellationError);
        else await expect(result).rejects.toThrow('Trust this workspace');
        expect(render).not.toHaveBeenCalled();
      }
    },
  );

  it('does not return rendered content when cancelled during rendering', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/review.prompt.md', encodeMarkdown(newPrompt('Review')));
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const renderStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    let cancelled = false;
    const token = {
      get isCancellationRequested() {
        return cancelled;
      },
      onCancellationRequested: () => new Disposable(),
    } satisfies vscode.CancellationToken;
    const tool = new PromptLibraryTool(
      new LibraryService(port),
      () => false,
      () => true,
      async () => {
        started();
        await pending;
        return { text: 'Private content', missing: [] };
      },
    );
    const result = tool.invoke(
      { input: { query: 'Review', scope: 'user' }, toolInvocationToken: undefined },
      token,
    );
    await renderStarted;
    cancelled = true;
    release();
    await expect(result).rejects.toBeInstanceOf(CancellationError);
  });
});
