import { describe, expect, it, vi } from 'vitest';
import { LibraryService } from '../src/application/library';
import { appendExactFilter, defaultSearchOptions, SearchIndex } from '../src/application/search';
import { encodeMarkdown, newPrompt, type Entry } from '../src/core/documents';
import { generate, variableTokens } from '../src/core/render';
import { memoryFiles } from './helpers';
import { assertLocalDuration } from './timing';

const source = (name: string) => encodeMarkdown(newPrompt(name));
describe('prompt library', () => {
  it('loads lazily, deduplicates loads, isolates bad files and leaves old settings/rules untouched', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/a.prompt.md', source('A'));
    files.set('user:prompts/old.yaml', 'version: 1\nname: Old\ncategory: review\ncontent: ignored');
    files.set('user:prompts/bad.prompt.md', '---\nversion: [\n---\n');
    files.set('user:rules/rule.yaml', 'invalid');
    files.set('user:settings.yaml', 'invalid old settings');
    files.set('user:elsewhere/a.prompt.md', source('Elsewhere'));
    const before = new Map(files);
    const service = new LibraryService(port);
    expect(port.list).not.toHaveBeenCalled();
    const [first, second] = await Promise.all([service.get('user'), service.get('user')]);
    expect(first).toBe(second);
    expect(port.list).toHaveBeenCalledTimes(1);
    expect(first.entries).toHaveLength(1);
    expect(first.problems).toEqual([
      { path: 'prompts/bad.prompt.md', message: expect.any(String) },
    ]);
    expect(files.has('user:prompts/old.yaml')).toBe(true);
    expect(await service.get('user')).toBe(first);
    expect(files).toEqual(before);
    files.set('user:prompts/bad.prompt.md', source('Repaired'));
    await service.refresh('user', 'prompts/bad.prompt.md');
    expect((await service.get('user')).problems).toEqual([]);
    files.delete('user:prompts/a.prompt.md');
    await service.refresh('user', 'prompts/a.prompt.md');
    expect((await service.get('user')).entries.map((entry) => entry.data.name)).toEqual([
      'Repaired',
    ]);
  });

  it('serializes competing writes and publishes the winner before the next operation', async () => {
    const { port } = memoryFiles();
    const service = new LibraryService(port);
    const results = await Promise.allSettled([
      service.writeSource('user', 'prompts/same.prompt.md', source('First'), undefined),
      service.writeSource('user', 'prompts/same.prompt.md', source('Second'), undefined),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect((await service.get('user')).entries[0]?.data.name).toBe('First');
    expect(await service.search('user', 'First')).toHaveLength(1);
  });

  it('keeps comments, rejects stale saves/deletes and recovers after a failed write', async () => {
    const { port, files } = memoryFiles();
    const service = new LibraryService(port);
    const original = source('A').replace('---\n', '---\n# original\n');
    await service.writeSource('user', 'prompts/a.prompt.md', original, undefined);
    const entry = (await service.get('user')).entries[0]!;
    await service.save('user', entry.path, { ...entry.data, name: 'Updated' }, entry.source);
    expect(files.get('user:prompts/a.prompt.md')).toContain('# original');
    await expect(service.delete(entry)).rejects.toThrow('Conflict');
    await expect(service.save('user', entry.path, entry.data, entry.source)).rejects.toThrow(
      'Conflict',
    );
    vi.mocked(port.write).mockRejectedValueOnce(new Error('Disk full'));
    await expect(
      service.save('user', 'prompts/new.prompt.md', newPrompt('New'), undefined),
    ).rejects.toThrow('Disk full');
    const current = (await service.get('user')).entries[0]!;
    await service.delete(current);
    expect((await service.get('user')).entries).toEqual([]);
  });

  it('rejects invalid imports, non-prompt locations and traversal without writing', async () => {
    const { port } = memoryFiles();
    const service = new LibraryService(port);
    expect(() => service.writeSource('user', 'prompts/a.prompt.md', 'bad', undefined)).toThrow();
    expect(() =>
      service.writeSource('user', 'elsewhere/a.prompt.md', source('A'), undefined),
    ).toThrow('outside');
    expect(() => service.save('user', '../escape.prompt.md', newPrompt('A'), undefined)).toThrow();
    expect(() => service.save('user', 'prompts/a.txt', newPrompt('A'), undefined)).toThrow(
      'outside',
    );
    expect(() =>
      service.delete({
        key: '',
        scope: 'user',
        path: 'other.prompt.md',
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
      service.save('user', 'prompts/a.prompt.md', newPrompt('A'), undefined),
    ).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ message: 'View disposed' }));
    unsubscribe();
    await service.refresh('user');
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('reloads only changed files and publishes each watcher burst once', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/a.prompt.md', source('A'));
    files.set('user:prompts/b.prompt.md', source('B'));
    const service = new LibraryService(port);
    await service.get('user');
    const changed = vi.fn();
    service.subscribe(changed);
    vi.mocked(port.read).mockClear();
    files.set('user:prompts/a.prompt.md', source('Updated'));
    files.set('user:prompts/nested/c.prompt.md', source('C'));
    await service.refreshMany('user', [
      'prompts/a.prompt.md',
      'prompts/a.prompt.md',
      'prompts/nested/c.prompt.md',
    ]);
    expect(port.read).toHaveBeenCalledTimes(2);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(await service.search('user', 'Updated')).toHaveLength(1);
    await service.refreshMany('user', ['settings.yaml', 'rules/a.yaml']);
    expect(changed).toHaveBeenCalledTimes(1);
    files.delete('user:prompts/b.prompt.md');
    await service.refreshMany('user', ['prompts/b.prompt.md']);
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
    vi.mocked(port.list).mockResolvedValueOnce(['prompts/gone.prompt.md']);
    expect((await service.get('user')).entries).toEqual([]);
  });

  it('isolates read failures during initial load and incremental refresh', async () => {
    const { port, files } = memoryFiles();
    files.set('user:prompts/a.prompt.md', source('A'));
    files.set('user:prompts/b.prompt.md', source('B'));
    vi.mocked(port.read).mockImplementation(async (scope, path) => {
      if (path === 'prompts/b.prompt.md') throw new Error('Permission denied');
      return files.get(`${scope}:${path}`);
    });
    const service = new LibraryService(port);
    const initial = await service.get('user');
    expect(initial.entries.map((entry) => entry.data.name)).toEqual(['A']);
    expect(initial.problems).toEqual([
      { path: 'prompts/b.prompt.md', message: 'Permission denied' },
    ]);

    files.set('user:prompts/a.prompt.md', source('Updated'));
    await service.refreshMany('user', ['prompts/a.prompt.md', 'prompts/b.prompt.md']);
    const refreshed = await service.get('user');
    expect(refreshed.entries.map((entry) => entry.data.name)).toEqual(['Updated']);
    expect(refreshed.problems).toEqual(initial.problems);
  });
});

describe('prompt search and rendering', () => {
  it('substitutes once and handles empty, invalid and unbalanced variables explicitly', () => {
    expect(generate('{{text}}\n{{text}}', { text: 'First\n{{selection}}' })).toEqual({
      text: 'First\n{{selection}}\nFirst\n{{selection}}',
      missing: [],
    });
    expect(generate('{{text}}', {})).toEqual({ text: '', missing: ['text'] });
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
        path: 'prompts/b.prompt.md',
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
        path: 'prompts/a.prompt.md',
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
    expect(index.query('b.prompt.md')).toEqual([entries[0]]);
    expect(index.query('tag:')).toHaveLength(2);
    index.update([entries[0]!]);
    expect(index.query()).toHaveLength(1);
    expect(index.query('', 'explain')).toEqual([]);
    index.update([{ ...entries[0]!, data: newPrompt('Changed') }]);
    expect(index.query('security')).toEqual([]);
    expect(index.query('', 'review')).toEqual([]);
  });

  it('parses quoted tag/category filters and appends exact filters idempotently', () => {
    const entry: Entry = {
      key: 'space-tag',
      scope: 'user',
      path: 'prompts/space-tag.prompt.md',
      source: '',
      data: { ...newPrompt('Security'), category: 'review', tags: ['security review'] },
    };
    const index = new SearchIndex();
    index.update([entry]);

    expect(index.query('tag:"security review" category:"review"')).toEqual([entry]);
    expect(index.query('category:REVIEW tag:"security review"')).toEqual([entry]);
    expect(index.query('tag:"security"')).toEqual([]);
    expect(index.query('  \t ')).toEqual([entry]);
    expect(index.query('scope:user')).toEqual([]);
    expect(index.query('tag:"unterminated')).toEqual([]);
    expect(index.query('tag:"invalid\\q"')).toEqual([]);
    const filtered = appendExactFilter('security', 'tag', 'security review');
    expect(filtered).toBe('security tag:"security review"');
    expect(appendExactFilter(filtered, 'tag', 'security review')).toBe(filtered);
    expect(appendExactFilter(filtered, 'category', 'review')).toBe(
      'security tag:"security review" category:"review"',
    );

    const quotedEntry = {
      ...entry,
      key: 'quoted-tag',
      data: { ...entry.data, tags: ['say "hello"'] },
    };
    index.update([quotedEntry]);
    const quotedFilter = appendExactFilter('', 'tag', 'say "hello"');
    expect(index.query(quotedFilter)).toEqual([quotedEntry]);
  });

  it('queries 10,000 cached prompts with local timing budgets', () => {
    const entries: Entry[] = Array.from({ length: 10_000 }, (_, i) => ({
      key: String(i),
      scope: 'user',
      path: `prompts/${i}.prompt.md`,
      source: '',
      data: {
        ...newPrompt(`Prompt ${i}`),
        tags: i === 123 ? ['target'] : [],
        content: i === 123 ? 'unique search phrase' : '',
      },
    }));
    const index = new SearchIndex();
    index.update(entries);
    const start = performance.now();
    const tagResults = index.query('tag:target');
    const tagDuration = performance.now() - start;
    expect(tagResults.map((entry) => entry.key)).toEqual(['123']);
    assertLocalDuration(tagDuration, 200, '10,000-prompt tag search');
    const fullTextStart = performance.now();
    const fullTextResults = index.query('unique search phrase');
    const fullTextDuration = performance.now() - fullTextStart;
    expect(fullTextResults.map((entry) => entry.key)).toEqual(['123']);
    assertLocalDuration(fullTextDuration, 200, '10,000-prompt full-text search');
    const fuzzyStart = performance.now();
    const fuzzyResults = index.query('Prampt 123', undefined, {
      ...defaultSearchOptions,
      matching: 'fuzzy',
    });
    const fuzzyDuration = performance.now() - fuzzyStart;
    expect(fuzzyResults.some((entry) => entry.key === '123')).toBe(true);
    assertLocalDuration(fuzzyDuration, 200, '10,000-prompt fuzzy search');
  });

  it('shares exact-first modes, case handling and filter constraints', () => {
    const index = new SearchIndex();
    const exact: Entry = {
      key: 'exact',
      scope: 'user',
      path: 'prompts/one.prompt.md',
      source: '',
      data: { ...newPrompt('Code  Review'), category: 'review', tags: ['Security'] },
    };
    const broader: Entry = {
      ...exact,
      key: 'broader',
      path: 'prompts/two.prompt.md',
      data: { ...newPrompt('Other'), content: 'Code Review', category: 'debug', tags: ['Quality'] },
    };
    index.update([broader, exact]);
    expect(index.query('  CODE  REVIEW  ')).toEqual([exact]);
    expect(
      index.query('Code Review', undefined, { ...defaultSearchOptions, matching: 'exact' }),
    ).toEqual([]);
    expect(
      index.query('Code  Review', undefined, { ...defaultSearchOptions, matching: 'exact' }),
    ).toEqual([exact]);
    expect(
      index.query('code  review', undefined, { ...defaultSearchOptions, caseSensitive: true }),
    ).toEqual([]);
    expect(
      index.query('Code Review', undefined, { ...defaultSearchOptions, caseSensitive: true }),
    ).toEqual([exact, broader]);
    expect(index.query('Code Review tag:QUALITY')).toEqual([broader]);
    expect(index.query('Code Review', 'DEBUG')).toEqual([broader]);
    expect(
      index.query('TAG:SECURITY', undefined, { ...defaultSearchOptions, caseSensitive: true }),
    ).toEqual([exact]);
    expect(
      index.query('tag:QUALITY', undefined, { ...defaultSearchOptions, matching: 'exact' }),
    ).toEqual([broader]);
    expect(index.query('', undefined, { ...defaultSearchOptions, matching: 'fuzzy' })).toEqual([
      exact,
      broader,
    ]);
  });

  it('ranks full-text candidates by weakest matching field, with name ordering as presentation only', () => {
    const index = new SearchIndex();
    const make = (key: string, name: string, description = '', content = ''): Entry => ({
      key,
      scope: 'user',
      path: `prompts/${key}.prompt.md`,
      source: '',
      data: { ...newPrompt(name), description, content },
    });
    const body = make('one', 'Alpha', '', 'inspect code');
    const metadata = make('two', 'Bravo', 'inspect code');
    const substring = make('three', 'Please inspect code');
    const prefix = make('four', 'inspect code carefully');
    index.update([body, metadata, substring, prefix]);
    expect(index.query('inspect')).toEqual([prefix, substring, metadata, body]);
    expect(index.query('inspect', undefined, { ...defaultSearchOptions, ranking: 'name' })).toEqual(
      [body, metadata, prefix, substring],
    );
    expect(
      index
        .matches('inspect code', undefined, defaultSearchOptions)
        .map((match) => match.relevance),
    ).toEqual([1, 2, 3, 3]);
    expect(index.query('inspect missing')).toEqual([]);
    const duplicate = { ...prefix, key: 'five', path: 'prompts/five.prompt.md' };
    index.update([prefix, duplicate]);
    expect(index.query('inspect').map((entry) => entry.path)).toEqual([
      duplicate.path,
      prefix.path,
    ]);
  });

  it.each([
    ['cde', 'code', false],
    ['cat', 'cot', false],
    ['code', 'cide', true],
    ['code', 'cde', true],
    ['code', 'coxde', true],
    ['code', 'cdoe', false],
    ['reviewx', 'reviewy', true],
    ['reviewxy', 'reviewyx', true],
    ['reviewx', 'reviezz', false],
    ['reviewxy', 'reviewzz', true],
    ['reviewxy', 'reviezzz', false],
    ['reviewxy', 'short', false],
  ])('bounds fuzzy name edits for %s → %s', (query, name, matched) => {
    const index = new SearchIndex();
    const entry: Entry = {
      key: 'one',
      scope: 'user',
      path: 'prompts/one.prompt.md',
      source: '',
      data: newPrompt(name),
    };
    index.update([entry]);
    expect(index.query(query, undefined, { ...defaultSearchOptions, matching: 'fuzzy' })).toEqual(
      matched ? [entry] : [],
    );
    expect(index.query(query)).toEqual([]);
  });

  it('runs fuzzy names only after full-text fails and retains case and exact filters', () => {
    const index = new SearchIndex();
    const first: Entry = {
      key: 'one',
      scope: 'user',
      path: 'prompts/one.prompt.md',
      source: '',
      data: { ...newPrompt('reviewyy'), tags: ['Quality'] },
    };
    const closer = {
      ...first,
      key: 'two',
      path: 'prompts/two.prompt.md',
      data: { ...first.data, name: 'reviewxy' },
    };
    const fullText = {
      ...first,
      key: 'three',
      path: 'prompts/three.prompt.md',
      data: { ...newPrompt('Other'), content: 'reviewxx' },
    };
    const options = { ...defaultSearchOptions, matching: 'fuzzy' as const };
    index.update([first, closer, fullText]);
    expect(index.query('reviewxx', undefined, options)).toEqual([fullText]);
    expect(index.query('reviewxx tag:QUALITY', undefined, options)).toEqual([closer, first]);
    expect(
      index.query('REVIEWXX tag:QUALITY', undefined, { ...options, caseSensitive: true }),
    ).toEqual([]);
    expect(index.query('reviewxx tag:missing', undefined, options)).toEqual([]);
  });
});
