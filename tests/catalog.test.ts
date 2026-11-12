import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { LibraryService } from '../src/application/library';
import { SearchIndex } from '../src/application/search';
import { LocalFiles } from '../src/platform/local-files';
import { promptCategories, promptFrontmatterSchema } from '../src/core/documents';
import { generate, variableTokens } from '../src/core/render';

describe('bundled prompt starters', () => {
  it('ships eighteen unique, editable prompts using the ordinary schema', async () => {
    const snapshot = await new LibraryService(
      new LocalFiles(() => resolve('resources/starter')),
    ).get('user');
    expect(snapshot.problems).toEqual([]);
    expect(snapshot.entries).toHaveLength(18);
    const paths = new Set<string>();
    const names = new Set<string>();
    for (const entry of snapshot.entries) {
      const { content, ...metadata } = entry.data;
      expect(promptFrontmatterSchema.parse(metadata)).toEqual(metadata);
      const frontmatter = entry.source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
      expect(frontmatter).not.toBeNull();
      expect(frontmatter?.[1]).not.toContain('content:');
      expect(entry.source.slice(frontmatter?.[0].length)).toBe(content);
      expect(promptCategories).toContain(entry.data.category);
      const filename = entry.path
        .split('/')
        .at(-1)
        ?.replace(/\.prompt\.md$/, '');
      const nameSlug = entry.data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      expect(filename).toBe(nameSlug);
      expect(paths.has(entry.path)).toBe(false);
      paths.add(entry.path);
      expect(names.has(entry.data.name)).toBe(false);
      names.add(entry.data.name);
      expect(() => variableTokens(entry.data.content)).not.toThrow();
    }
  });
  it('satisfies security, generic technology-review and incident discovery examples', async () => {
    const snapshot = await new LibraryService(
      new LocalFiles(() => resolve('resources/starter')),
    ).get('user');
    const index = new SearchIndex();
    index.update(snapshot.entries);
    const ids = (query: string) =>
      index.query(query).map((entry) =>
        entry.path
          .split('/')
          .at(-1)
          ?.replace(/\.prompt\.md$/, ''),
      );
    expect(ids('security')).toEqual(expect.arrayContaining(['review-security']));
    expect(ids('review')).toEqual(
      expect.arrayContaining(['review-code', 'review-complexity', 'review-architecture']),
    );
    expect(ids('incident')).toEqual(
      expect.arrayContaining(['triage-production-incident', 'analyze-root-cause']),
    );
    expect(ids('tag:audit')).toEqual(
      expect.arrayContaining([
        'audit-release-readiness',
        'audit-implementation-completeness',
        'audit-accessibility',
      ]),
    );
    for (const name of [
      'explain-selected-code',
      'clarify-requirements',
      'plan-smallest-useful-implementation',
      'generate-focused-unit-tests',
      'plan-behavior-preserving-refactor',
      'document-feature-usage',
      'implement-scoped-change',
      'create-issue',
      'create-task',
    ])
      expect(snapshot.entries.some((entry) => entry.path === `prompts/${name}.prompt.md`)).toBe(
        true,
      );
  });
  it('renders selected context for issue and task drafts', async () => {
    const snapshot = await new LibraryService(
      new LocalFiles(() => resolve('resources/starter')),
    ).get('user');
    for (const name of ['create-issue', 'create-task']) {
      const entry = snapshot.entries.find((item) => item.path === `prompts/${name}.prompt.md`);
      expect(entry).toBeDefined();
      const result = generate(entry!.data.content, { selection: 'Selected request' });
      expect(result.missing).toEqual([]);
      expect(result.text).toContain('Selected request');
      expect(result.text).toContain('Headline:');
      expect(result.text).toContain('Description:');
    }
  });
});
