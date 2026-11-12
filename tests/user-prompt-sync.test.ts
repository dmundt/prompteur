import { describe, expect, it, vi } from 'vitest';
import { UserPromptSync, userPromptSyncStateKey } from '../src/workbench/user-prompt-sync';
import { memoryFiles } from './helpers';

class SyncState {
  values = new Map<string, unknown>();
  syncedKeys: readonly string[] = [];

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.values.set(key, value);
  }

  setKeysForSync(keys: readonly string[]): void {
    this.syncedKeys = keys;
  }
}

describe('User prompt Settings Sync', () => {
  it('reads local prompts concurrently within a bounded batch and preserves their contents', async () => {
    const { port, files } = memoryFiles();
    for (let index = 0; index < 25; index++)
      files.set(`user:prompts/${index}.prompt.md`, `content ${index}`);
    let active = 0;
    let peak = 0;
    vi.mocked(port.read).mockImplementation(async (scope, path) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      try {
        return files.get(`${scope}:${path}`);
      } finally {
        active--;
      }
    });
    const state = new SyncState();
    await new UserPromptSync(state, port).configure(true);
    const snapshot = state.get<{ files: Record<string, string> }>(userPromptSyncStateKey)!;
    expect(Object.keys(snapshot.files)).toHaveLength(25);
    expect(snapshot.files['prompts/24.prompt.md']).toBe('content 24');
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(16);
  });

  it('reports the first path failure without changing sync state or files', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/a.prompt.md', 'a');
    files.set('user:prompts/b.prompt.md', 'b');
    vi.mocked(port.read).mockImplementation(async (_scope, path) => {
      if (path.endsWith('/a.prompt.md')) {
        await new Promise((resolve) => setTimeout(resolve, 2));
        throw new Error('first path failed');
      }
      throw new Error('second path failed');
    });
    const state = new SyncState();
    await expect(new UserPromptSync(state, port).configure(true)).rejects.toThrow(
      'first path failed',
    );
    expect(state.get(userPromptSyncStateKey)).toBeUndefined();
    expect([...files.values()]).toEqual(['a', 'b']);
  });

  it('merges remote changes, preserves local conflicts, and propagates deletions', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/keep.prompt.md', 'unchanged');
    files.set('user:prompts/stale.prompt.md', 'unchanged');
    files.set('user:prompts/conflict.prompt.md', 'local edit');
    const state = new SyncState();
    state.values.set('userPromptSyncBaseline', {
      version: 1,
      files: {
        'prompts/keep.prompt.md': 'unchanged',
        'prompts/stale.prompt.md': 'unchanged',
        'prompts/conflict.prompt.md': 'base',
      },
      deleted: [],
    });
    state.values.set(userPromptSyncStateKey, {
      version: 1,
      files: {
        'prompts/keep.prompt.md': 'unchanged',
        'prompts/conflict.prompt.md': 'remote edit',
        'prompts/remote.prompt.md': 'remote prompt',
      },
      deleted: ['prompts/stale.prompt.md'],
    });
    const sync = new UserPromptSync(state, port);

    await sync.configure(true);

    expect(state.syncedKeys).toEqual([
      userPromptSyncStateKey,
      'approvedPromptCategories',
      'promptCategoryDescriptions',
    ]);
    expect(files.has('user:prompts/stale.prompt.md')).toBe(false);
    expect(files.get('user:prompts/remote.prompt.md')).toBe('remote prompt');
    expect(files.get('user:prompts/conflict.prompt.md')).toBe('local edit');

    const currentSync = state.get<{ version: 1; files: Record<string, string>; deleted: string[] }>(
      userPromptSyncStateKey,
    )!;
    state.values.set(userPromptSyncStateKey, {
      ...currentSync,
      files: {
        ...currentSync.files,
        'prompts/concurrent.prompt.md': 'concurrent remote prompt',
      },
    });
    await port.remove('user', 'prompts/remote.prompt.md', 'remote prompt');
    files.set('user:prompts/new.prompt.md', 'new prompt');
    await sync.persist();
    const synced = state.get<{
      files: Record<string, string>;
      deleted: string[];
    }>(userPromptSyncStateKey)!;
    expect(synced.files['prompts/new.prompt.md']).toBe('new prompt');
    expect(synced.files['prompts/concurrent.prompt.md']).toBe('concurrent remote prompt');
    expect(files.get('user:prompts/concurrent.prompt.md')).toBe('concurrent remote prompt');
    expect(synced.deleted).toContain('prompts/remote.prompt.md');
  });

  it('seeds missing sync state from existing local prompts and supports opt-out', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/local.prompt.md', 'local prompt');
    const state = new SyncState();
    const sync = new UserPromptSync(state, port);

    await sync.configure(true);
    expect(
      state.get<{ files: Record<string, string> }>(userPromptSyncStateKey)?.files[
        'prompts/local.prompt.md'
      ],
    ).toBe('local prompt');

    await sync.configure(false);
    expect(state.syncedKeys).toEqual([]);
    expect(state.values.get(userPromptSyncStateKey)).toBeDefined();
    await sync.reconcile();
    await sync.persist();
  });

  it('rejects unsafe synced paths without changing local files', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/local.prompt.md', 'local prompt');
    const state = new SyncState();
    state.values.set(userPromptSyncStateKey, {
      version: 1,
      files: { '../outside.prompt.md': 'unsafe' },
      deleted: [],
    });
    const sync = new UserPromptSync(state, port);

    await expect(sync.configure(true)).rejects.toThrow('invalid data');
    expect(files.get('user:prompts/local.prompt.md')).toBe('local prompt');
    await expect(sync.persist()).rejects.toThrow('invalid data');
  });

  it('imports remote-only files without a baseline and keeps local path conflicts', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/conflict.prompt.md', 'local prompt');
    const state = new SyncState();
    state.values.set(userPromptSyncStateKey, {
      version: 1,
      files: {
        'prompts/conflict.prompt.md': 'remote prompt',
        'prompts/remote.prompt.md': 'remote-only prompt',
      },
      deleted: [],
    });
    const sync = new UserPromptSync(state, port);

    await sync.configure(true);

    expect(files.get('user:prompts/conflict.prompt.md')).toBe('local prompt');
    expect(files.get('user:prompts/remote.prompt.md')).toBe('remote-only prompt');
  });

  it('rejects malformed snapshots before importing any files', async () => {
    const invalidSnapshots: unknown[] = [
      null,
      { version: 2, files: {}, deleted: [] },
      { version: 1, files: [], deleted: [] },
      { version: 1, files: { 'prompts/bad.prompt.md': 4 }, deleted: [] },
      { version: 1, files: {}, deleted: ['../bad.prompt.md'] },
    ];
    for (const value of invalidSnapshots) {
      const { port, files } = memoryFiles();
      files.set('user:prompts/local.prompt.md', 'local prompt');
      const state = new SyncState();
      state.values.set(userPromptSyncStateKey, value);
      const sync = new UserPromptSync(state, port);

      await expect(sync.configure(true)).rejects.toThrow('invalid data');
      expect([...files.keys()]).toEqual(['user:prompts/local.prompt.md']);
    }
  });
});
