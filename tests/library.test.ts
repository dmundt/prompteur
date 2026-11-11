import { describe, expect, it, vi } from 'vitest';
import { LibraryService } from '../src/application/library';
import { SearchIndex } from '../src/application/search';
import { encodeYaml, newPrompt, type Entry } from '../src/core/documents';
import { generate, variableTokens } from '../src/core/render';
import { memoryFiles } from './helpers';

const source = (name: string) => encodeYaml(newPrompt(name));
describe('prompt library', () => {
  it('loads lazily, deduplicates loads, isolates bad files and leaves old settings/rules untouched', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/a.yaml', source('A'));
    files.set('user:prompts/bad.yaml', 'version: [');
    files.set('user:rules/rule.yaml', 'invalid');
    files.set('user:settings.yaml', 'invalid old settings');
    files.set('user:elsewhere/a.yaml', source('Elsewhere'));
    const before = new Map(files);
    const service = new LibraryService(port);
    expect(port.list).not.toHaveBeenCalled();
    const [first, second] = await Promise.all([service.get('user'), service.get('user')]);
    expect(first).toBe(second);
    expect(port.list).toHaveBeenCalledTimes(1);
    expect(first.entries).toHaveLength(1);
    expect(first.problems).toEqual([{ path: 'prompts/bad.yaml', message: expect.any(String) }]);
    expect(await service.get('user')).toBe(first);
    expect(files).toEqual(before);
    files.set('user:prompts/bad.yaml', source('Repaired'));
    await service.refresh('user', 'prompts/bad.yaml');
    expect((await service.get('user')).problems).toEqual([]);
    files.delete('user:prompts/a.yaml');
    await service.refresh('user', 'prompts/a.yaml');
    expect((await service.get('user')).entries.map((entry) => entry.data.name)).toEqual([
      'Repaired',
    ]);
  });

  it('serializes competing writes and publishes the winner before the next operation', async () => {
    const { port } = memoryFiles();
    const service = new LibraryService(port);
    const results = await Promise.allSettled([
      service.writeSource('user', 'prompts/same.yaml', source('First'), undefined),
      service.writeSource('user', 'prompts/same.yaml', source('Second'), undefined),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect((await service.get('user')).entries[0]?.data.name).toBe('First');
    expect(await service.search('user', 'First')).toHaveLength(1);
  });

  it('keeps comments, rejects stale saves/deletes and recovers after a failed write', async () => {
    const { port, files } = memoryFiles();
    const service = new LibraryService(port);
    await service.writeSource('user', 'prompts/a.yaml', `# original\n${source('A')}`, undefined);
    const entry = (await service.get('user')).entries[0]!;
    await service.save('user', entry.path, { ...entry.data, name: 'Updated' }, entry.source);
    expect(files.get('user:prompts/a.yaml')).toContain('# original');
    await expect(service.delete(entry)).rejects.toThrow('Conflict');
    await expect(service.save('user', entry.path, entry.data, entry.source)).rejects.toThrow(
      'Conflict',
    );
    vi.mocked(port.write).mockRejectedValueOnce(new Error('Disk full'));
    await expect(
      service.save('user', 'prompts/new.yaml', newPrompt('New'), undefined),
    ).rejects.toThrow('Disk full');
    const current = (await service.get('user')).entries[0]!;
    await service.delete(current);
    expect((await service.get('user')).entries).toEqual([]);
  });

  it('rejects invalid imports, non-prompt locations and traversal without writing', async () => {
    const { port } = memoryFiles();
    const service = new LibraryService(port);
    expect(() => service.writeSource('user', 'prompts/a.yaml', 'bad', undefined)).toThrow();
    expect(() => service.writeSource('user', 'elsewhere/a.yaml', source('A'), undefined)).toThrow(
      'outside',
    );
    expect(() => service.save('user', '../escape.yaml', newPrompt('A'), undefined)).toThrow();
    expect(() => service.save('user', 'prompts/a.txt', newPrompt('A'), undefined)).toThrow(
      'outside',
    );
    expect(() =>
      service.delete({
        key: '',
        scope: 'user',
        path: 'other.yaml',
        data: newPrompt('A'),
        source: '',
      }),
    ).toThrow('outside');
    expect(port.write).not.toHaveBeenCalled();
  });

  it('reports subscriber failures without reporting committed writes as failed', async () => {
    const { port } = memoryFiles();
    const report = vi.fn();
    const service = new LibraryService(port, report);
    const unsubscribe = service.subscribe(() => {
      throw new Error('View disposed');
    });
    await expect(
      service.save('user', 'prompts/a.yaml', newPrompt('A'), undefined),
    ).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'View disposed' }));
    unsubscribe();
    await service.refresh('user');
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('reloads only changed files and publishes each watcher burst once', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/a.yaml', source('A'));
    files.set('user:prompts/b.yaml', source('B'));
    const service = new LibraryService(port);
    await service.get('user');
    const changed = vi.fn();
    service.subscribe(changed);
    vi.mocked(port.read).mockClear();
    files.set('user:prompts/a.yaml', source('Updated'));
    files.set('user:prompts/nested/c.yml', source('C'));
    await service.refreshMany('user', ['prompts/a.yaml', 'prompts/a.yaml', 'prompts/nested/c.yml']);
    expect(port.read).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(await service.search('user', 'Updated')).toHaveLength(1);
    await service.refreshMany('user', ['settings.yaml', 'rules/a.yaml']);
    expect(changed).toHaveBeenCalledTimes(1);
    files.delete('user:prompts/b.yaml');
    await service.refreshMany('user', ['prompts/b.yaml']);
    expect((await service.get('user')).entries).toHaveLength(2);
    expect(changed).toHaveBeenCalledTimes(2);
    await service.refresh('user');
    expect((await service.get('user')).entries).toHaveLength(2);
  });

  it('tolerates disappearing files and permits a retry after load failure', async () => {
    const { port } = memoryFiles();
    const service = new LibraryService(port);
    vi.mocked(port.list).mockRejectedValueOnce(new Error('Unavailable'));
    await expect(service.get('user')).rejects.toThrow('Unavailable');
    vi.mocked(port.list).mockResolvedValueOnce(['prompts/gone.yaml']);
    expect((await service.get('user')).entries).toEqual([]);
  });

  it('isolates read failures during initial load and incremental refresh', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/a.yaml', source('A'));
    files.set('user:prompts/b.yaml', source('B'));
    vi.mocked(port.read).mockImplementation(async (scope, path) => {
      if (path === 'prompts/b.yaml') throw new Error('Permission denied');
      return files.get(`${scope}:${path}`);
    });
    const service = new LibraryService(port);
    const initial = await service.get('user');
    expect(initial.entries.map((entry) => entry.data.name)).toEqual(['A']);
    expect(initial.problems).toEqual([{ path: 'prompts/b.yaml', message: 'Permission denied' }]);

    files.set('user:prompts/a.yaml', source('Updated'));
    await service.refreshMany('user', ['prompts/a.yaml', 'prompts/b.yaml']);
    const refreshed = await service.get('user');
    expect(refreshed.entries.map((entry) => entry.data.name)).toEqual(['Updated']);
    expect(refreshed.problems).toEqual(initial.problems);
  });
});

describe('prompt search and rendering', () => {
  it('substitutes once and handles empty, invalid and unbalanced variables explicitly', () => {
    expect(
      generate('{{selection}} {{filename}}', { selection: '{{clipboard}}', filename: 'a.ts' }),
    ).toEqual({
      text: '{{clipboard}} a.ts',
      missing: [],
    });
    expect(generate('{{clipboard}} {{clipboard}} {{workspace}}', {})).toEqual({
      text: '  ',
      missing: ['clipboard', 'workspace'],
    });
    expect(generate('Plain text', {})).toEqual({ text: 'Plain text', missing: [] });
    expect(generate('Scope: {{selection}}', {})).toEqual({ text: 'Scope: ', missing: [] });
    expect(generate('First\n\n\n\n  \nSecond', {}).text).toBe('First\n\nSecond');
    expect(generate('First\r\n\r\n\r\nSecond', {}).text).toBe('First\r\n\r\nSecond');
    expect(generate('First\n\nSecond', {}).text).toBe('First\n\nSecond');
    expect(generate('{{selection}}{{clipboard}}', { selection: '' })).toEqual({
      text: '',
      missing: ['clipboard'],
    });
    expect(() => variableTokens('{{unsupported}}')).toThrow('Unsupported');
    expect(() => variableTokens('{{selection')).toThrow('Unbalanced');
    expect(() => variableTokens('}}')).toThrow('Unbalanced');
    expect(variableTokens('{{ selection }}')[0]?.name).toBe('selection');
  });

  it('finds full text and exact tags case-insensitively with alphabetical results', () => {
    const entries: Entry[] = [
      {
        key: 'b',
        scope: 'user',
        path: 'prompts/b.yaml',
        source: '',
        data: {
          ...newPrompt('Beta'),
          category: 'review',
          content: 'security review',
          tags: ['Quality', 'security'],
        },
      },
      {
        key: 'a',
        scope: 'user',
        path: 'prompts/a.yaml',
        source: '',
        data: { ...newPrompt('Alpha'), category: 'explain', tags: ['quality'] },
      },
    ];
    const index = new SearchIndex();
    index.update(entries);
    expect(index.query().map((entry) => entry.key)).toEqual(['a', 'b']);
    expect(index.query('TAG:QUALITY security').map((entry) => entry.key)).toEqual(['b']);
    expect(index.query('tag:security tag:quality').map((entry) => entry.key)).toEqual(['b']);
    expect(index.query('', 'REVIEW').map((entry) => entry.key)).toEqual(['b']);
    expect(index.query('tag:secur')).toEqual([]);
    expect(index.query('b.yaml')).toEqual([entries[0]]);
    expect(index.query('tag:')).toHaveLength(2);
    index.update([entries[0]!]);
    expect(index.query()).toHaveLength(1);
    expect(index.query('', 'explain')).toEqual([]);
    index.update([{ ...entries[0]!, data: newPrompt('Changed') }]);
    expect(index.query('security')).toEqual([]);
    expect(index.query('', 'review')).toEqual([]);
  });

  it('queries 10,000 cached prompts within the existing 200ms budget', () => {
    const entries: Entry[] = Array.from({ length: 10_000 }, (_, i) => ({
      key: String(i),
      scope: 'user',
      path: `prompts/${i}.yaml`,
      source: '',
      data: { ...newPrompt(`Prompt ${i}`), tags: i === 123 ? ['target'] : [] },
    }));
    const index = new SearchIndex();
    index.update(entries);
    const start = performance.now();
    expect(index.query('tag:target')[0]?.key).toBe('123');
    expect(performance.now() - start).toBeLessThan(200);
  });
});
