import { describe, expect, it } from 'vitest';
import {
  decodeYaml,
  encodeYaml,
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
  it('accepts only canonical categories and rejects removed metadata fields', () => {
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
    expect(promptSchema.safeParse({ ...prompt, category: 'engineering' }).success).toBe(false);
    expect(decodeYaml('version: 1\nname: Review\ncategory: REVIEW\ncontent: safe').category).toBe(
      'review',
    );
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
    const source = `# Metadata note\n${encodeYaml(prompt)}`;
    const encoded = encodeYaml({ ...decodeYaml(source), name: 'Updated' }, source);
    expect(encoded).toContain('# Metadata note');
    expect(Object.keys(decodeYaml(encoded)).sort()).toEqual([
      'category',
      'content',
      'description',
      'name',
      'tags',
      'version',
    ]);
    expect(encodeYaml(decodeYaml(encoded), encoded)).toBe(encoded);
  });
  it('indexes ordinary discovery fields plus filename', () => {
    const promptEntry: Entry = {
      key: 'p',
      scope: 'user',
      path: 'prompts/code-review.prompt.yaml',
      source: '',
      data: prompt,
    };
    const index = new SearchIndex();
    index.update([promptEntry]);
    for (const term of ['code-review', 'review', 'quality', 'Inspect'])
      expect(index.query(term).map((entry) => entry.key)).toContain('p');
    expect(index.query('tag:quality').map((entry) => entry.key)).toContain('p');
    expect(index.query('rust')).toEqual([]);
    expect(index.query('nonexistent')).toEqual([]);
    expect(index.query('DOTNET review')).toEqual([]);
  });
});
