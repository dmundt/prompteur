import * as fs from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import { relativePath, type Scope } from '../core/documents';
import type { FilePort } from '../application/library';
import { assertTextBudget, documentByteLimit, libraryEntryLimit } from '../core/limits';

const codeIs = (error: unknown, code: string): boolean =>
  (error as NodeJS.ErrnoException).code === code;

export class LocalFiles implements FilePort {
  constructor(
    private readonly root: (scope: Scope) => string,
    private readonly assertWritable: (scope: Scope) => void = () => undefined,
  ) {}

  private async safe(scope: Scope, path?: string): Promise<string> {
    const root = resolve(this.root(scope));
    const parts = path === undefined ? [] : relativePath.parse(path).split('/');
    const ancestors: string[] = [];
    for (let ancestor = root; ; ancestor = dirname(ancestor)) {
      ancestors.unshift(ancestor);
      if (dirname(ancestor) === ancestor) break;
    }
    let current = root;
    const candidates = [...ancestors];
    for (const part of parts) {
      current = join(current, part);
      candidates.push(current);
    }
    for (const candidate of candidates) {
      try {
        if ((await fs.lstat(candidate)).isSymbolicLink())
          throw new Error('Symbolic links are not supported in libraries');
      } catch (error) {
        if (!codeIs(error, 'ENOENT')) throw error;
      }
    }
    return current;
  }

  async list(scope: Scope): Promise<string[]> {
    const root = await this.safe(scope);
    const files: string[] = [];
    let folders = 0;
    const queue = [root];
    while (queue.length) {
      const directory = queue.pop()!;
      let children;
      try {
        children = await fs.readdir(directory, { withFileTypes: true });
      } catch (error) {
        if (codeIs(error, 'ENOENT')) continue;
        throw error;
      }
      for (const child of children) {
        if (child.isSymbolicLink()) continue;
        const path = join(directory, child.name);
        const portable = relative(root, path).split(sep).join('/');
        if (child.isDirectory()) {
          folders++;
          queue.push(path);
        } else if (child.isFile()) files.push(portable);
        if (files.length > libraryEntryLimit || folders > libraryEntryLimit)
          throw new Error('Library entry limit exceeded');
      }
    }
    return files.sort();
  }

  async read(scope: Scope, path: string): Promise<string | undefined> {
    try {
      const location = await this.safe(scope, path);
      const stat = await fs.stat(location);
      if (!stat.isFile() || stat.size > documentByteLimit)
        throw new Error('Document is not a regular file or exceeds byte limit');
      const text = await fs.readFile(location, 'utf8');
      assertTextBudget(text);
      return text;
    } catch (error) {
      if (codeIs(error, 'ENOENT')) return undefined;
      throw error;
    }
  }

  async write(
    scope: Scope,
    path: string,
    text: string,
    expected: string | undefined,
  ): Promise<void> {
    this.assertWritable(scope);
    assertTextBudget(text);
    const destination = await this.safe(scope, path);
    await fs.mkdir(dirname(destination), { recursive: true });
    await this.lock(destination, async () => {
      if ((await this.read(scope, path)) !== expected)
        throw new Error(`File changed on disk: ${path}. Reload before saving.`);
      const temporary = `${destination}.${randomUUID()}.tmp`;
      try {
        const handle = await fs.open(temporary, 'wx');
        try {
          await handle.writeFile(text, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        if (expected === undefined) await fs.link(temporary, destination);
        else {
          if ((await this.read(scope, path)) !== expected)
            throw new Error(`File changed on disk: ${path}`);
          await fs.rename(temporary, destination);
        }
      } finally {
        await fs.rm(temporary, { force: true });
      }
    });
  }

  async remove(scope: Scope, path: string, expected: string): Promise<void> {
    this.assertWritable(scope);
    const destination = await this.safe(scope, path);
    await this.lock(destination, async () => {
      if ((await this.read(scope, path)) !== expected)
        throw new Error(`File changed on disk: ${path}`);
      await fs.unlink(destination);
    });
  }

  private async lock<T>(path: string, action: () => Promise<T>): Promise<T> {
    const lockPath = `${path}.lock`;
    let handle;
    try {
      handle = await fs.open(lockPath, 'wx');
    } catch (error) {
      if (codeIs(error, 'EEXIST'))
        throw new Error(
          `Library file busy. If no Prompteur writer remains, remove stale lock: ${lockPath}`,
        );
      throw error;
    }
    try {
      return await action();
    } finally {
      await handle.close();
      await fs.rm(lockPath, { force: true });
    }
  }
}
