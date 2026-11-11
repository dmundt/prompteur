import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFiles } from '../src/platform/local-files';
import { LibraryService } from '../src/application/library';
import { newPrompt } from '../src/core/documents';

const roots: string[] = [];
async function setup() {
  const root = await fs.mkdtemp(join(tmpdir(), 'prompteur-'));
  roots.push(root);
  return { root, files: new LocalFiles((scope) => join(root, scope)) };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

describe('local filesystem adapter', () => {
  it('creates, lists, reads, replaces and removes real files', async () => {
    const { files } = await setup();
    expect(await files.list('user')).toEqual([]);
    expect(await files.read('user', 'prompts/a.yaml')).toBeUndefined();
    await files.write('user', 'prompts/a.yaml', 'first', undefined);
    await files.write('user', 'prompts/a.yaml', 'second', 'first');
    expect(await files.read('user', 'prompts/a.yaml')).toBe('second');
    expect(await files.list('user')).toEqual(['prompts/a.yaml']);
    await files.remove('user', 'prompts/a.yaml', 'second');
    expect(await files.list('user')).toEqual([]);
  });
  it('rejects stale edits, path traversal, occupied targets, lock contention and untrusted writes', async () => {
    const { files, root } = await setup();
    await files.write('user', 'a.yaml', 'first', undefined);
    await expect(files.write('user', 'a.yaml', 'lost', undefined)).rejects.toThrow('changed');
    await expect(files.remove('user', 'a.yaml', 'stale')).rejects.toThrow('changed');
    await expect(files.read('user', '../escape.yaml')).rejects.toThrow();
    await fs.writeFile(join(root, 'user', 'a.yaml.lock'), '');
    await expect(files.write('user', 'a.yaml', 'blocked', 'first')).rejects.toThrow('busy');
    const restricted = new LocalFiles(
      () => root,
      () => {
        throw new Error('Untrusted');
      },
    );
    await expect(restricted.write('workspace', 'a.yaml', 'unsafe', undefined)).rejects.toThrow(
      'Untrusted',
    );
    await expect(restricted.remove('workspace', 'a.yaml', '')).rejects.toThrow('Untrusted');
    expect(await files.read('user', 'a.yaml')).toBe('first');
  });
  it('reloads manual filesystem edits through incremental service events', async () => {
    const { files, root } = await setup();
    const service = new LibraryService(files);
    await service.save('workspace', 'prompts/a.prompt.md', newPrompt('A'), undefined);
    await fs.writeFile(
      join(root, 'workspace', 'prompts', 'a.prompt.md'),
      '---\nversion: 1\nname: Changed outside editor\ncategory: explain\n---\nmanual\n',
    );
    await service.refresh('workspace', 'prompts/a.prompt.md');
    expect((await service.get('workspace')).entries[0]?.data.name).toBe('Changed outside editor');
  });
  it('does not follow symbolic directory links when scanning or reading', async () => {
    const { files, root } = await setup();
    await fs.mkdir(join(root, 'outside'));
    await fs.mkdir(join(root, 'user'));
    await fs.writeFile(join(root, 'outside', 'secret.yaml'), 'private');
    await fs.symlink(
      join(root, 'outside'),
      join(root, 'user', 'linked'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    expect(await files.list('user')).toEqual([]);
    await expect(files.read('user', 'linked/secret.yaml')).rejects.toThrow('Symbolic');
  });
});
