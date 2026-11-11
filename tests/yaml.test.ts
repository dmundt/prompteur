import { describe, expect, it } from 'vitest';
import {
  decodeYaml,
  encodeYaml,
  entryKey,
  isYaml,
  newPrompt,
  relativePath,
} from '../src/core/documents';

describe('canonical YAML documents', () => {
  it('preserves comments and multiline content across edits', () => {
    const source =
      '# My instructions\nversion: 1\nname: Review # visible name\ncategory: review\ntags:\n  - review # owner note\ncontent: |\n  Review this.\n  Keep spacing.\n';
    const prompt = decodeYaml(source);
    const encoded = encodeYaml({ ...prompt, name: 'Code review' }, source);
    expect(encoded).toContain('# My instructions');
    expect(encoded).toContain('# visible name');
    expect(encoded).toContain('# owner note');
    expect(encoded).toContain('content: |');
    expect(decodeYaml(encoded).content).toBe('Review this.\nKeep spacing.\n');
    expect(decodeYaml(encoded).tags).toEqual(['review']);
    expect(encodeYaml(decodeYaml(encoded), encoded)).toBe(encoded);
  });
  it('normalizes BOM, line endings and absent optional fields on save only', () => {
    const source = 'version: 1\nname: Test\ncategory: test\ncontent: hello\n';
    const data = decodeYaml(source);
    const encoded = encodeYaml(data, source);
    expect(encoded).not.toContain('\r');
    expect(encoded.endsWith('\n')).toBe(true);
    expect(data.tags).toEqual([]);
    expect(Object.keys(newPrompt('Name')).sort()).toEqual([
      'category',
      'content',
      'description',
      'name',
      'tags',
      'version',
    ]);
    expect(encoded).not.toContain('description:');
    expect(encoded).not.toContain('tags:');
  });
  it.each([
    'null',
    '[]',
    'version: 2\nid: x\nname: X\ncontent: hi',
    'version: 1\nid: x',
    'version: [',
    'version: 1\nversion: 1',
    'root: &root\n  self: *root',
  ])('rejects malformed, unsupported or recursive YAML: %s', (source) => {
    expect(() => decodeYaml(source)).toThrow();
  });
  it('validates safe folder paths while rejecting rule fields', () => {
    expect(() => decodeYaml('version: 1\nname: R\nenabled: true\ncontent: Hi\n')).toThrow();
    for (const path of [
      '../oops',
      '/root',
      'C:/path',
      'bad\\path',
      'x//y',
      'x/./y',
      'x\0y',
      'x*',
      'CON.yaml',
      'trailing.',
      'trailing ',
    ])
      expect(relativePath.safeParse(path).success).toBe(false);
    expect(relativePath.parse('review/nested')).toBe('review/nested');
    expect(entryKey('user', 'prompts/a.yaml')).toBe('user:prompts/a.yaml');
    expect(isYaml('test.YML')).toBe(true);
    expect(isYaml('file.json')).toBe(false);
  });
  it('orders newly written nested metadata deterministically', () => {
    const prompt = newPrompt('Name');
    expect(encodeYaml(prompt)).toBe(
      encodeYaml({
        content: '',
        tags: [],
        category: 'explain',
        description: '',
        name: 'Name',
        version: 1,
      }),
    );
  });
  it('requires version one and an approved category without an ID', () => {
    expect(decodeYaml('version: 1\nname: Audit\ncategory: REVIEW\ncontent: safe')).toMatchObject({
      version: 1,
      name: 'Audit',
      category: 'review',
    });
    expect(() =>
      decodeYaml('version: 1\nname: Audit\ncategory: engineering\ncontent: safe'),
    ).toThrow('approved profile categories');
    expect(() => decodeYaml('name: Audit\ncontent: safe')).toThrow('version');
    expect(() => decodeYaml('version: 2\nname: Audit\ncontent: safe')).toThrow('version');
  });
});
