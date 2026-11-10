import { vi } from 'vitest';
import type { FilePort } from '../src/application/library';

export function memoryFiles() {
  const files = new Map<string, string>();
  const port: FilePort = {
    list: vi.fn(async (scope) =>
      [...files.keys()]
        .filter((key) => key.startsWith(`${scope}:`))
        .map((key) => key.slice(scope.length + 1)),
    ),
    read: vi.fn(async (scope, path) => files.get(`${scope}:${path}`)),
    write: vi.fn(async (scope, path, text, expected) => {
      if (files.get(`${scope}:${path}`) !== expected) throw new Error('Conflict');
      files.set(`${scope}:${path}`, text);
    }),
    remove: vi.fn(async (scope, path, expected) => {
      if (files.get(`${scope}:${path}`) !== expected) throw new Error('Conflict');
      files.delete(`${scope}:${path}`);
    }),
  };
  return { port, files };
}
