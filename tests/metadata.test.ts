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
