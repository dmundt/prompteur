import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LibraryService } from '../src/application/library';
import { LocalFiles } from '../src/platform/local-files';
import { decodeYaml, encodeYaml, newPrompt, parseYaml } from '../src/core/documents';
import { documentByteLimit } from '../src/core/limits';
import { generate, variableTokens } from '../src/core/render';
import { memoryFiles } from './helpers';

vi.mock('../src/core/limits', async (original) => ({
  ...(await original<typeof import('../src/core/limits')>()),
  libraryByteLimit: 1024,
  libraryEntryLimit: 4,
}));

const roots: string[] = [];
async function fixture() {
  const root = await fs.mkdtemp(join(tmpdir(), 'prompteur-safety-'));
  roots.push(root);
  return root;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

describe('preserved safety and resource boundaries', () => {
  it('rejects oversized/deep YAML and bounds diagnostics', () => {
    expect(() => parseYaml('x'.repeat(documentByteLimit + 1))).toThrow('byte limit');
    expect(() => parseYaml(`nested: ${'['.repeat(80)}0${']'.repeat(80)}`)).toThrow('depth limit');
    try {
      decodeYaml(
        `version: 1\nname: A\ncontent: safe\ntags: [${Array.from({ length: 1000 }, () => 'null').join(',')}]`,
      );
      throw new Error('Expected invalid tags');
    } catch (error) {
      expect((error as Error).message.length).toBeLessThanOrEqual(2048);
    }
  });
  it('bounds expanded output and scans malformed delimiters without quadratic retries', () => {
    expect(() =>
      generate('{{clipboard}}'.repeat(100), { clipboard: 'x'.repeat(documentByteLimit) }),
    ).toThrow('byte limit');
    expect(() => generate('tail'.repeat(documentByteLimit * 9), {})).toThrow('byte limit');
    const start = performance.now();
    expect(() => variableTokens('{{'.repeat(100_000))).toThrow('Unbalanced');
    expect(performance.now() - start).toBeLessThan(250);
  });
  it('rejects junction/symlink ancestors above the library root', async () => {
    const root = await fixture();
    await fs.mkdir(join(root, 'workspace'));
    await fs.mkdir(join(root, 'outside', 'prompts'), { recursive: true });
    await fs.symlink(
      join(root, 'outside'),
      join(root, 'workspace', '.vscode'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    const local = new LocalFiles(() => join(root, 'workspace', '.vscode', 'prompts'));
    await expect(local.read('workspace', 'prompts/a.yaml')).rejects.toThrow('Symbolic');
    await expect(local.write('workspace', 'prompts/a.yaml', 'safe', undefined)).rejects.toThrow(
      'Symbolic',
    );
    expect(await fs.readdir(join(root, 'outside', 'prompts'))).toEqual([]);
  });
  it('checks size before reading and leaves no temporary files after conflict', async () => {
    const root = await fixture();
    await fs.writeFile(join(root, 'large.yaml'), 'x'.repeat(documentByteLimit + 1));
    const local = new LocalFiles(() => root);
    await expect(local.read('user', 'large.yaml')).rejects.toThrow('byte limit');
    await expect(local.read('user', '.')).rejects.toThrow();
    await local.write('user', 'a.yaml', 'first', undefined);
    await expect(local.write('user', 'a.yaml', 'second', 'stale')).rejects.toThrow('changed');
    expect((await fs.readdir(root)).sort()).toEqual(['a.yaml', 'large.yaml']);
  });
  it('enforces library entry and byte limits during loads, saves and reloads', async () => {
    const { port, files } = memoryFiles();
    const service = new LibraryService(port);
    for (let i = 0; i < 5; i++)
      files.set(`user:prompts/${i}.yaml`, encodeYaml(newPrompt(String(i))));
    await expect(service.get('user')).rejects.toThrow('entry limit');
    files.clear();
    const large = encodeYaml({ ...newPrompt('Large'), content: 'x'.repeat(1100) });
    files.set('user:prompts/a.yaml', large);
    await expect(service.get('user')).rejects.toThrow('byte limit');
    files.clear();
    await service.get('user');
    await expect(service.writeSource('user', 'prompts/a.yaml', large, undefined)).rejects.toThrow(
      'resource limit',
    );
    files.set('user:prompts/a.yaml', large);
    await expect(service.refresh('user', 'prompts/a.yaml')).rejects.toThrow('resource limit');
    files.clear();
    for (let i = 0; i < 4; i++)
      files.set(`user:prompts/${i}.yaml`, encodeYaml(newPrompt(String(i))));
    await service.refresh('user');
    await expect(
      service.save('user', 'prompts/new.yaml', newPrompt('New'), undefined),
    ).rejects.toThrow('resource limit');
    files.set('user:prompts/new.yaml', encodeYaml(newPrompt('New')));
    await expect(service.refresh('user', 'prompts/new.yaml')).rejects.toThrow('resource limit');
  });
  it('caps filesystem enumeration rather than traversing unbounded trees', async () => {
    const root = await fixture();
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => fs.writeFile(join(root, `${i}.yaml`), 'test')),
    );
    await expect(new LocalFiles(() => root).list('user')).rejects.toThrow('entry limit');
  });
});
