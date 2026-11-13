import { describe, expect, it } from 'vitest';
import {
  decodeMarkdown,
  encodeMarkdown,
  newPrompt,
  promptCategories,
  promptSchema,
  type Entry,
} from '../src/core/documents';
import { SearchIndex } from '../src/application/search';
import { documentByteLimit } from '../src/core/limits';

const prompt = {
  ...newPrompt('Inspect change'),
  description: 'Inspect changes',
  category: 'review' as const,
  tags: ['quality'],
};

describe('minimal document metadata', () => {
  it('enforces built-in categories unless a profile category has been approved', () => {
    expect(promptCategories).toEqual([
      'explain',
      'plan',
      'implement',
      'review',
      'test',
      'debug',
      'document',
    ]);
    expect(promptSchema.parse({ ...prompt, category: 'review' }).category).toBe('review');
    expect(promptSchema.parse({ ...prompt, category: 'engineering' }).category).toBe('engineering');
    expect(() => promptSchema.parse({ ...prompt, category: 'a'.repeat(65) })).toThrow();
    const markdown = (category: string, extra = '') =>
      `---\nversion: 1\nname: Review\ncategory: ${category}\n${extra}---\nsafe`;
    expect(decodeMarkdown(markdown('REVIEW')).category).toBe('review');
    expect(() => decodeMarkdown(markdown('engineering'))).toThrow('approved profile categories');
    expect(
      decodeMarkdown(markdown('engineering'), [...promptCategories, 'engineering']).category,
    ).toBe('engineering');
    for (const field of [
      'id',
      'builtin',
      'builtinId',
      'languageTags',
      'technologyTags',
      'audienceTags',
      'difficulty',
      'estimatedTokens',
      'author',
      'created',
      'modified',
      'extensions',
      'customProperties',
      'deprecated',
      'replacement',
    ])
      expect(promptSchema.safeParse({ ...prompt, [field]: 'removed' }).success).toBe(false);
  });
  it('accepts category and tag metadata at their schema limits only', () => {
    const category = 'x'.repeat(64);
    const tags = Array.from({ length: 128 }, (_, index) => `tag-${index}`);
    expect(promptSchema.parse({ ...prompt, category, tags })).toMatchObject({ category, tags });
    expect(promptSchema.parse({ ...prompt, tags: tags.slice(1) })).toMatchObject({
      tags: tags.slice(1),
    });
    expect(() => promptSchema.parse({ ...prompt, category: `${category}x` })).toThrow();
    expect(() => promptSchema.parse({ ...prompt, tags: [...tags, 'tag-128'] })).toThrow();
    expect(() => promptSchema.parse({ ...prompt, tags: ['  '] })).toThrow();
    expect(() => promptSchema.parse({ ...prompt, tags: [''] })).toThrow();
  });
  it('accepts documents through the 1 MiB UTF-8 byte limit only', () => {
    const base = encodeMarkdown(prompt);
    const overhead = Buffer.byteLength(base);
    const remaining = documentByteLimit - overhead;
    const content = 'é'.repeat(Math.floor(remaining / 2)) + (remaining % 2 ? 'x' : '');
    const exact = encodeMarkdown({ ...prompt, content });
    expect(Buffer.byteLength(exact)).toBe(documentByteLimit);
    expect(decodeMarkdown(exact).content).toBe(content);
    expect(() => encodeMarkdown({ ...prompt, content: `${content}x` })).toThrow('byte limit');
    expect(() => decodeMarkdown(`${exact}x`)).toThrow('byte limit');
  });
  it('accepts YAML at depth 64 and node count 50,000, rejecting the next level', () => {
    const nested = (depth: number) =>
      `version: 1\nname: A\ncategory: review\nnested: ${'['.repeat(depth)}x${']'.repeat(depth)}`;
    expect(() => decodeMarkdown(`---\n${nested(61)}\n---\n`)).toThrow('Unrecognized key');
    expect(() => decodeMarkdown(`---\n${nested(62)}\n---\n`)).toThrow('node/depth limit');

    const withTagNodes = (count: number) =>
      `version: 1\nname: A\ncategory: review\ntags: [${Array(count).fill('x').join(',')}]`;
    expect(() => decodeMarkdown(`---\n${withTagNodes(49_986)}\n---\n`)).toThrow('<=128 items');
    expect(() => decodeMarkdown(`---\n${withTagNodes(49_987)}\n---\n`)).toThrow('<=128 items');
    expect(() => decodeMarkdown(`---\n${withTagNodes(49_988)}\n---\n`)).toThrow('node/depth limit');
  });
  it('preserves comments without generating internal metadata', () => {
    const source = encodeMarkdown(prompt).replace('---\n', '---\n# Metadata note\n');
    const encoded = encodeMarkdown({ ...decodeMarkdown(source), name: 'Updated' }, source);
    expect(encoded).toContain('# Metadata note');
    expect(Object.keys(decodeMarkdown(encoded)).sort()).toEqual([
      'category',
      'content',
      'description',
      'name',
      'tags',
      'version',
    ]);
    expect(encodeMarkdown(decodeMarkdown(encoded), encoded)).toBe(encoded);
  });
  it('indexes ordinary discovery fields plus filename', () => {
    const promptEntry: Entry = {
      key: 'p',
      scope: 'user',
      path: 'prompts/review-code.prompt.md',
      source: '',
      data: prompt,
    };
    const index = new SearchIndex();
    index.update([promptEntry]);
    for (const term of ['review-code', 'review', 'quality', 'Inspect'])
      expect(index.query(term).map((entry) => entry.key)).toContain('p');
    expect(index.query('tag:quality').map((entry) => entry.key)).toContain('p');
    expect(index.query('rust')).toEqual([]);
    expect(index.query('nonexistent')).toEqual([]);
    expect(index.query('DOTNET review')).toEqual([]);
  });
});
