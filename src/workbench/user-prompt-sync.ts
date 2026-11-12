import { isPromptMarkdown, promptFolder, relativePath } from '../core/documents';
import { assertTextBudget, libraryByteLimit, libraryEntryLimit } from '../core/limits';
import type { FilePort } from '../application/library';

export const userPromptSyncStateKey = 'syncedUserPrompts';
const approvedCategoriesStateKey = 'approvedPromptCategories';
const baselineKey = 'userPromptSyncBaseline';

interface SyncState {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
  setKeysForSync(keys: readonly string[]): void;
}

interface PromptSnapshot {
  version: 1;
  files: Record<string, string>;
  deleted: string[];
}

function safePromptPath(path: string): boolean {
  return (
    path.startsWith(`${promptFolder}/`) &&
    isPromptMarkdown(path) &&
    relativePath.safeParse(path).success
  );
}

function parseSnapshot(value: unknown): PromptSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== 1 ||
    !candidate.files ||
    typeof candidate.files !== 'object' ||
    Array.isArray(candidate.files) ||
    !Array.isArray(candidate.deleted)
  )
    return undefined;
  const files: Record<string, string> = Object.create(null);
  let bytes = 0;
  const paths = Object.keys(candidate.files as object).sort();
  if (paths.length > libraryEntryLimit) return undefined;
  for (const path of paths) {
    const source = (candidate.files as Record<string, unknown>)[path];
    if (!safePromptPath(path) || typeof source !== 'string') return undefined;
    assertTextBudget(source);
    bytes += Buffer.byteLength(source);
    if (bytes > libraryByteLimit) return undefined;
    files[path] = source;
  }
  const deleted = [...new Set(candidate.deleted)];
  if (deleted.some((path) => typeof path !== 'string' || !safePromptPath(path))) return undefined;
  return {
    version: 1,
    files,
    deleted: deleted.filter((path): path is string => typeof path === 'string').sort(),
  };
}

function snapshot(files: Record<string, string>, deleted: Iterable<string>): PromptSnapshot {
  const orderedFiles: Record<string, string> = Object.create(null);
  for (const path of Object.keys(files).sort()) orderedFiles[path] = files[path]!;
  const orderedDeleted = [...new Set(deleted)].filter((path) => !(path in orderedFiles)).sort();
  return { version: 1, files: orderedFiles, deleted: orderedDeleted };
}

export class UserPromptSync {
  private enabled = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly state: SyncState,
    private readonly files: FilePort,
  ) {}

  configure(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    this.state.setKeysForSync(enabled ? [userPromptSyncStateKey, approvedCategoriesStateKey] : []);
    return enabled ? this.reconcile() : Promise.resolve();
  }

  reconcile(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.enabled) return;
      const local = await this.readLocal();
      const remote = parseSnapshot(this.state.get<unknown>(userPromptSyncStateKey));
      if (!remote) {
        if (this.state.get(userPromptSyncStateKey) !== undefined)
          throw new Error(
            'Synced User prompts have invalid data; local prompts were left unchanged',
          );
        const initial = snapshot(local, []);
        await this.writeState(initial);
        return;
      }
      const baseline = parseSnapshot(this.state.get<unknown>(baselineKey));
      const merged = this.merge(local, remote, baseline);
      await this.apply(local, merged);
      await this.writeState(merged);
    });
  }

  persist(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.enabled) return;
      const local = await this.readLocal();
      const currentValue = this.state.get<unknown>(userPromptSyncStateKey);
      const remote = parseSnapshot(currentValue);
      if (!remote && currentValue !== undefined)
        throw new Error('Synced User prompts have invalid data; local prompts were left unchanged');
      const baseline = parseSnapshot(this.state.get<unknown>(baselineKey));
      const merged = remote ? this.merge(local, remote, baseline) : snapshot(local, []);
      await this.apply(local, merged);
      await this.writeState(merged);
    });
  }

  private async readLocal(): Promise<Record<string, string>> {
    const files: Record<string, string> = Object.create(null);
    const paths = (await this.files.list('user')).filter(safePromptPath);
    if (paths.length > libraryEntryLimit) throw new Error('User prompt sync entry limit exceeded');
    let bytes = 0;
    for (let offset = 0; offset < paths.length; offset += 16) {
      const batch = paths.slice(offset, offset + 16);
      const results = await Promise.allSettled(batch.map((path) => this.files.read('user', path)));
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') throw result.reason;
        const source = result.value;
        if (source === undefined) continue;
        assertTextBudget(source);
        bytes += Buffer.byteLength(source);
        if (bytes > libraryByteLimit) throw new Error('User prompt sync size limit exceeded');
        files[batch[index]!] = source;
      }
    }
    return files;
  }

  private merge(
    local: Record<string, string>,
    remote: PromptSnapshot,
    baseline: PromptSnapshot | undefined,
  ): PromptSnapshot {
    const remoteDeleted = new Set(remote.deleted);
    const baselineDeleted = new Set(baseline?.deleted ?? []);
    const paths = new Set([
      ...Object.keys(local),
      ...Object.keys(remote.files),
      ...remote.deleted,
      ...Object.keys(baseline?.files ?? {}),
      ...baselineDeleted,
    ]);
    const merged: Record<string, string> = Object.create(null);
    const deleted = new Set(remote.deleted);
    for (const path of paths) {
      const localValue = local[path];
      const remoteValue = remoteDeleted.has(path) ? undefined : remote.files[path];
      const baselineValue = baselineDeleted.has(path) ? undefined : baseline?.files[path];
      let value: string | undefined;
      if (!baseline) value = localValue ?? remoteValue;
      else {
        const localChanged = localValue !== baselineValue;
        const remoteChanged = remoteValue !== baselineValue;
        if (localChanged) value = localValue;
        else if (remoteChanged) value = remoteValue;
        else value = remoteValue;
      }
      if (value === undefined) deleted.add(path);
      else {
        merged[path] = value;
        deleted.delete(path);
      }
    }
    return snapshot(merged, deleted);
  }

  private async apply(local: Record<string, string>, merged: PromptSnapshot): Promise<void> {
    for (const [path, source] of Object.entries(local))
      if (!(path in merged.files)) await this.files.remove('user', path, source);
    for (const [path, source] of Object.entries(merged.files))
      if (local[path] !== source) await this.files.write('user', path, source, local[path]);
  }

  private async writeState(value: PromptSnapshot): Promise<void> {
    const current = this.state.get<unknown>(userPromptSyncStateKey);
    if (JSON.stringify(current) !== JSON.stringify(value))
      await this.state.update(userPromptSyncStateKey, value);
    await this.state.update(baselineKey, value);
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(action);
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
