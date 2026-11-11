import {
  decodeYaml,
  encodeYaml,
  entryKey,
  isYaml,
  promptFolder,
  promptCategories,
  relativePath,
  type Entry,
  type Problem,
  type PromptData,
  type Scope,
  type Snapshot,
} from '../core/documents';
import { libraryByteLimit, libraryEntryLimit } from '../core/limits';
import { SearchIndex } from './search';

export interface FilePort {
  list(scope: Scope): Promise<string[]>;
  read(scope: Scope, path: string): Promise<string | undefined>;
  write(scope: Scope, path: string, text: string, expected: string | undefined): Promise<void>;
  remove(scope: Scope, path: string, expected: string): Promise<void>;
}
interface RecordFile {
  source: string;
  entry?: Entry;
  problem?: Problem;
}
interface ScopeCache {
  records: Map<string, RecordFile>;
  snapshot: Snapshot;
  index: SearchIndex;
}

export class LibraryService {
  private readonly cache = new Map<Scope, ScopeCache>();
  private readonly loading = new Map<Scope, Promise<Snapshot>>();
  private readonly listeners = new Set<(scope: Scope) => void>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly files: FilePort,
    private readonly report: (error: unknown) => void = console.error,
    private readonly allowedCategories: () => readonly string[] = () => promptCategories,
  ) { }

  readFile(scope: Scope, path: string): Promise<string | undefined> {
    return this.files.read(scope, path);
  }

  async search(scope: Scope, query: string, category?: string): Promise<Entry[]> {
    await this.get(scope);
    return this.cache.get(scope)!.index.query(query, category);
  }

  subscribe(listener: (scope: Scope) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async get(scope: Scope): Promise<Snapshot> {
    const cached = this.cache.get(scope);
    if (cached) return cached.snapshot;
    const pending = this.loading.get(scope);
    if (pending) return pending;
    const load = this.load(scope);
    this.loading.set(scope, load);
    try {
      return await load;
    } finally {
      this.loading.delete(scope);
    }
  }

  private applicable(path: string): boolean {
    return path.startsWith(`${promptFolder}/`) && isYaml(path);
  }

  private failedRecord(path: string, error: unknown): RecordFile {
    return { source: '', problem: { path, message: messageOf(error) } };
  }

  private async load(scope: Scope): Promise<Snapshot> {
    const paths = (await this.files.list(scope)).filter((path) => this.applicable(path));
    if (paths.length > libraryEntryLimit) throw new Error('Library entry limit exceeded');
    const records = new Map<string, RecordFile>();
    let bytes = 0;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(16, paths.length) }, async () => {
        for (; ;) {
          const path = paths[cursor++];
          if (path === undefined) break;
          let source: string | undefined;
          try {
            source = await this.files.read(scope, path);
          } catch (error) {
            records.set(path, this.failedRecord(path, error));
            continue;
          }
          if (source !== undefined) {
            bytes += Buffer.byteLength(source);
            if (bytes > libraryByteLimit) throw new Error('Library byte limit exceeded');
            records.set(path, this.record(scope, path, source));
          }
        }
      }),
    );
    return this.publish(scope, records, false);
  }

  private record(scope: Scope, path: string, source: string): RecordFile {
    try {
      return {
        source,
        entry: {
          key: entryKey(scope, path),
          scope,
          path,
          data: decodeYaml(source, this.allowedCategories()),
          source,
        },
      };
    } catch (error) {
      return { source, problem: { path, message: messageOf(error) } };
    }
  }

  private publish(scope: Scope, records: Map<string, RecordFile>, notify = true): Snapshot {
    const entries: Entry[] = [];
    const problems: Problem[] = [];
    for (const record of records.values()) {
      if (record.entry) entries.push(record.entry);
      if (record.problem) problems.push(record.problem);
    }
    const snapshot = { entries, problems };
    const index = this.cache.get(scope)?.index ?? new SearchIndex();
    index.update(entries);
    this.cache.set(scope, { records, snapshot, index });
    if (notify) {
      for (const listener of this.listeners) {
        try {
          listener(scope);
        } catch (error) {
          this.report(error);
        }
      }
    }
    return snapshot;
  }

  refresh(scope: Scope, path?: string): Promise<void> {
    return this.refreshMany(scope, path === undefined ? undefined : [path]);
  }

  refreshMany(scope: Scope, paths?: readonly string[]): Promise<void> {
    return this.enqueue(() => this.refreshNow(scope, paths));
  }

  private async refreshNow(scope: Scope, paths?: readonly string[]): Promise<void> {
    const loading = this.loading.get(scope);
    if (loading) await loading;
    const cache = this.cache.get(scope);
    if (!cache || paths === undefined) {
      await this.load(scope);
      this.publish(scope, this.cache.get(scope)!.records);
      return;
    }
    const applicable = [...new Set(paths)].filter((path) => this.applicable(path));
    if (!applicable.length) return;
    const records = new Map(cache.records);
    for (const path of applicable) {
      try {
        const source = await this.files.read(scope, path);
        if (source === undefined) records.delete(path);
        else records.set(path, this.record(scope, path, source));
      } catch (error) {
        records.set(path, this.failedRecord(path, error));
      }
    }
    if (
      records.size > libraryEntryLimit ||
      [...records.values()].reduce((bytes, record) => bytes + Buffer.byteLength(record.source), 0) >
      libraryByteLimit
    )
      throw new Error('Library resource limit exceeded');
    this.publish(scope, records);
  }

  save(
    scope: Scope,
    path: string,
    data: PromptData,
    expected: string | undefined,
    template?: string,
  ): Promise<void> {
    relativePath.parse(path);
    if (!this.applicable(path)) throw new Error('File is outside the prompt folder');
    const text = encodeYaml(data, template ?? expected, this.allowedCategories());
    return this.writeSource(scope, path, text, expected);
  }

  writeSource(
    scope: Scope,
    path: string,
    source: string,
    expected: string | undefined,
  ): Promise<void> {
    relativePath.parse(path);
    if (!this.applicable(path)) throw new Error('File is outside the prompt folder');
    decodeYaml(source, this.allowedCategories());
    return this.enqueue(async () => {
      await this.get(scope);
      const records = this.cache.get(scope)!.records;
      const bytes =
        [...records.values()].reduce(
          (total, record) => total + Buffer.byteLength(record.source),
          0,
        ) -
        Buffer.byteLength(records.get(path)?.source ?? '') +
        Buffer.byteLength(source);
      if (bytes > libraryByteLimit || (!records.has(path) && records.size >= libraryEntryLimit))
        throw new Error('Library resource limit exceeded');
      await this.files.write(scope, path, source, expected);
      await this.refreshNow(scope, [path]);
    });
  }

  delete(entry: Entry): Promise<void> {
    relativePath.parse(entry.path);
    if (!this.applicable(entry.path)) throw new Error('File is outside the prompt folder');
    return this.enqueue(async () => {
      await this.files.remove(entry.scope, entry.path, entry.source);
      await this.refreshNow(entry.scope, [entry.path]);
    });
  }

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.queue.then(action);
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}

export function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2048);
}
