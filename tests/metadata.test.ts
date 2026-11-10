import { describe, expect, it } from 'vitest';
import { decodeYaml, encodeYaml, newPrompt, promptSchema, type Entry } from '../src/core/documents';
import { SearchIndex } from '../src/application/search';

const prompt = {
  ...newPrompt('Inspect change'),
  description: 'Inspect changes',
  category: 'review' as const,
  tags: ['quality'],
};

describe('minimal document metadata', () => {
  it('accepts free categories and rejects removed metadata fields', () => {
    expect(promptSchema.parse({ ...prompt, category: 'engineering' }).category).toBe('engineering');
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
