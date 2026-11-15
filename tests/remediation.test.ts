import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LibraryService } from '../src/application/library';
import { LocalFiles } from '../src/platform/local-files';
import { decodeMarkdown, encodeMarkdown, newPrompt } from '../src/core/documents';
import { documentByteLimit, generatedByteLimit } from '../src/core/limits';
import { generate, variableTokens } from '../src/core/render';
import { memoryFiles } from './helpers';
import { assertLocalDuration } from './timing';

vi.mock('../src/core/limits', async (original) => ({
  ...(await original<typeof import('../src/core/limits')>()),
  libraryByteLimit: 1024,
  libraryEntryLimit: 4,
}));

const roots: string[] = [];
async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(join(tmpdir(), 'prompteur-safety-')));
  roots.push(root);
  return root;
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { force: true, recursive: true })));
});

describe('preserved safety and resource boundaries', () => {
  it('rejects oversized/deep frontmatter YAML and bounds diagnostics', () => {
    expect(() => decodeMarkdown(`---\nname: ${'x'.repeat(documentByteLimit)}\n---\n`)).toThrow(
      'byte limit',
    );
    expect(() => decodeMarkdown(`---\nnested: ${'['.repeat(80)}0${']'.repeat(80)}\n---\n`)).toThrow(
      'depth limit',
    );
    try {
      decodeMarkdown(
        `---\nversion: 1\nname: A\ntags: [${Array.from({ length: 1000 }, () => 'null').join(',')}]\n---\nsafe`,
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
    let error: unknown;
    try {
      variableTokens('{{'.repeat(100_000));
    } catch (caught) {
      error = caught;
    }
    const duration = performance.now() - start;
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ message: expect.stringContaining('Unbalanced') });
    assertLocalDuration(duration, 250, 'Malformed delimiter scan');
  });
  it('accepts generated output at 32 MiB and rejects one byte over', () => {
    const exact = 'x'.repeat(32 * documentByteLimit);
    expect(generate(exact.slice(0, -1), {}).text).toHaveLength(exact.length - 1);
    expect(generate(exact, {}).text).toBe(exact);
    expect(() => generate(`${exact}x`, {})).toThrow('byte limit');
  });
  it('counts the UTF-8 literal tail after substitution at the generated-output boundary', () => {
    const clipboard = 'x'.repeat(generatedByteLimit - 2);
    const rendered = generate('{{clipboard}}\u00e9', { clipboard });
    expect(Buffer.byteLength(rendered.text, 'utf8')).toBe(generatedByteLimit);
    expect(rendered.text.endsWith('\u00e9')).toBe(true);
    expect(rendered.missing).toEqual([]);
    expect(() => generate('{{clipboard}}\u00e9x', { clipboard })).toThrow(
      'Generated prompt exceeds byte limit',
    );
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
    const exact = 'x'.repeat(documentByteLimit);
    await local.write('user', 'exact.yaml', exact, undefined);
    await expect(local.read('user', 'exact.yaml')).resolves.toBe(exact);
    await expect(local.write('user', 'over-limit.yaml', `${exact}x`, undefined)).rejects.toThrow(
      'byte limit',
    );
    await local.write('user', 'a.yaml', 'first', undefined);
    await expect(local.write('user', 'a.yaml', 'second', 'stale')).rejects.toThrow('changed');
    expect((await fs.readdir(root)).sort()).toEqual(['a.yaml', 'exact.yaml', 'large.yaml']);
  });
  it('enforces library entry and byte limits during loads, saves and reloads', async () => {
    const { port, files } = memoryFiles();
    const service = new LibraryService(port);
    for (let i = 0; i < 5; i++)
      files.set(`user:prompts/${i}.prompt.md`, encodeMarkdown(newPrompt(String(i))));
    await expect(service.get('user')).rejects.toThrow('entry limit');
    files.clear();
    const large = encodeMarkdown({ ...newPrompt('Large'), content: 'x'.repeat(1100) });
    files.set('user:prompts/a.prompt.md', large);
    await expect(service.get('user')).rejects.toThrow('byte limit');
    files.clear();
    await service.get('user');
    await expect(
      service.writeSource('user', 'prompts/a.prompt.md', large, undefined),
    ).rejects.toThrow('resource limit');
    files.set('user:prompts/a.prompt.md', large);
    await expect(service.refresh('user', 'prompts/a.prompt.md')).rejects.toThrow('resource limit');
    files.clear();
    for (let i = 0; i < 4; i++)
      files.set(`user:prompts/${i}.prompt.md`, encodeMarkdown(newPrompt(String(i))));
    await service.refresh('user');
    await expect(
      service.save('user', 'prompts/new.prompt.md', newPrompt('New'), undefined),
    ).rejects.toThrow('resource limit');
    files.set('user:prompts/new.prompt.md', encodeMarkdown(newPrompt('New')));
    await expect(service.refresh('user', 'prompts/new.prompt.md')).rejects.toThrow(
      'resource limit',
    );
  });
  it('accepts library entry and cached-source limits exactly, rejecting one over', async () => {
    for (const count of [3, 4, 5]) {
      const { port, files } = memoryFiles();
      for (let index = 0; index < count; index++) files.set(`user:prompts/${index}.prompt.md`, 'x');
      if (count < 5)
        expect((await new LibraryService(port).get('user')).problems).toHaveLength(count);
      else await expect(new LibraryService(port).get('user')).rejects.toThrow('entry limit');
    }

    for (const bytes of [1023, 1024, 1025]) {
      const { port, files } = memoryFiles();
      files.set('user:prompts/size.prompt.md', 'x'.repeat(bytes));
      if (bytes <= 1024)
        expect((await new LibraryService(port).get('user')).problems).toHaveLength(1);
      else await expect(new LibraryService(port).get('user')).rejects.toThrow('byte limit');
    }
  });
  it('caps filesystem enumeration rather than traversing unbounded trees', async () => {
    for (const count of [3, 4, 5]) {
      const root = await fixture();
      await Promise.all(
        Array.from({ length: count }, (_, index) =>
          fs.writeFile(join(root, `${index}.yaml`), 'test'),
        ),
      );
      if (count <= 4)
        await expect(new LocalFiles(() => root).list('user')).resolves.toHaveLength(count);
      else await expect(new LocalFiles(() => root).list('user')).rejects.toThrow('entry limit');
    }

    for (const count of [3, 4, 5]) {
      const root = await fixture();
      await Promise.all(
        Array.from({ length: count }, (_, index) => fs.mkdir(join(root, `nested-${index}`))),
      );
      if (count <= 4) await expect(new LocalFiles(() => root).list('user')).resolves.toEqual([]);
      else await expect(new LocalFiles(() => root).list('user')).rejects.toThrow('entry limit');
    }
  });
});
