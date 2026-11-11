import { describe, expect, it } from 'vitest';
import {
  decodeMarkdown,
  encodeMarkdown,
  isPromptMarkdown,
  newPrompt,
  promptCategories,
  PromptDocumentError,
  relativePath,
} from '../src/core/documents';

describe('Markdown prompt documents', () => {
  it('keeps raw Markdown body unchanged while editing frontmatter', () => {
    const body = '# Review\r\n\r\n```yaml\r\n---\r\ncontent: stays body\r\n```\r\n';
    const source =
      '\uFEFF---\r\nversion: 1\r\nname: Review\r\ncategory: review\r\ntags:\r\n  - security\r\n---\r\n' +
      body;
    const prompt = decodeMarkdown(source);
    expect(prompt.content).toBe(body);
    const updated = { ...prompt, name: 'Code review', tags: ['approved'] };
    const encoded = encodeMarkdown(updated, source);
    expect(encoded.startsWith('\uFEFF---\r\n')).toBe(true);
    expect(encoded).toContain('name: Code review');
    expect(encoded.slice(0, encoded.indexOf('\r\n---\r\n', 4))).not.toContain('content:');
    expect(encoded.endsWith(body)).toBe(true);
    expect(decodeMarkdown(encoded)).toEqual(updated);
  });

  it('supports empty body and canonical creation', () => {
    const encoded = encodeMarkdown(newPrompt('New prompt'));
    expect(encoded).toContain('---\nversion: 1\n');
    expect(encoded.endsWith('---\n')).toBe(true);
    expect(decodeMarkdown(encoded)).toEqual(newPrompt('New prompt'));
    expect(decodeMarkdown('---\nversion: 1\nname: Empty\ncategory: review\n---').content).toBe('');
  });

  it('does not add omitted optional frontmatter fields during metadata edits', () => {
    const source = '---\nversion: 1\nname: Bare\ncategory: review\n---\nBody';
    const prompt = decodeMarkdown(source);
    const encoded = encodeMarkdown({ ...prompt, name: 'Updated' }, source);
    expect(encoded).toContain('name: Updated');
    expect(encoded).not.toContain('description:');
    expect(encoded).not.toContain('tags:');
    expect(decodeMarkdown(encoded).content).toBe('Body');
  });

  it('rejects malformed or non-strict frontmatter', () => {
    for (const source of [
      'version: 1\nname: Missing delimiters',
      '---\nversion: 1\nname: Missing close',
      '---\nversion: 1\nversion: 1\nname: Duplicate\n---\nBody',
      '---\nversion: 1\nname: Unknown field\nextra: true\n---\nBody',
      '---\nversion: 2\nname: Unsupported\ncategory: review\n---\nBody',
      '---\nversion: &v 1\nname: Alias\ncategory: review\nextra: *v\n---\nBody',
      '---\nnull\n---\nBody',
      '---',
    ])
      expect(() => decodeMarkdown(source)).toThrow();
  });

  it('reports parser offsets within the frontmatter source', () => {
    const source = '---\nversion: 1\nname: Broken\ncategory: review\nunknown: [\n---\nBody';
    let error: unknown;
    try {
      decodeMarkdown(source);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(PromptDocumentError);
    expect((error as PromptDocumentError).offset).toBeGreaterThan(4);
    expect((error as PromptDocumentError).offset).toBeLessThan(source.indexOf('\n---\n', 4));
  });

  it('validates built-in and approved profile categories', () => {
    const source = '---\nversion: 1\nname: Research\ncategory: research\n---\nBody';
    expect(() => decodeMarkdown(source)).toThrow('approved profile categories');
    expect(decodeMarkdown(source, [...promptCategories, 'research']).category).toBe('research');
  });

  it('recognizes only the prompt Markdown suffix and keeps path validation', () => {
    expect(isPromptMarkdown('prompts/review.prompt.md')).toBe(true);
    expect(isPromptMarkdown('prompts/review.PROMPT.MD')).toBe(true);
    expect(isPromptMarkdown('prompts/review.md')).toBe(false);
    expect(isPromptMarkdown('prompts/review.prompt.yaml')).toBe(false);
    expect(relativePath.parse('prompts/review.prompt.md')).toBe('prompts/review.prompt.md');
  });
});
