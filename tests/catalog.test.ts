import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { LibraryService } from '../src/application/library';
import { SearchIndex } from '../src/application/search';
import { LocalFiles } from '../src/platform/local-files';
import { parseYaml, promptCategories } from '../src/core/documents';
import { variableTokens } from '../src/core/render';

describe('bundled prompt starters', () => {
  it('ships sixteen unique, editable prompts using the ordinary schema', async () => {
    const snapshot = await new LibraryService(
      new LocalFiles(() => resolve('resources/starter')),
    ).get('user');
    expect(snapshot.problems).toEqual([]);
    expect(snapshot.entries).toHaveLength(16);
    const paths = new Set<string>();
    const names = new Set<string>();
    for (const entry of snapshot.entries) {
      const raw = parseYaml(entry.source).toJS() as Record<string, unknown>;
      expect(Object.keys(raw).sort()).toEqual(
        ['version', 'name', 'description', 'category', 'tags', 'content'].sort(),
      );
      expect(promptCategories).toContain(entry.data.category);
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
          ?.replace(/\.yaml$/, ''),
      );
    expect(ids('security')).toEqual(expect.arrayContaining(['security-review']));
    expect(ids('review')).toEqual(
      expect.arrayContaining(['code-review', 'complexity-review', 'architecture-review']),
    );
    expect(ids('incident')).toEqual(
      expect.arrayContaining(['production-incident', 'root-cause-analysis']),
    );
    expect(ids('tag:audit')).toEqual(
      expect.arrayContaining([
        'release-readiness-audit',
        'implementation-completeness-audit',
        'accessibility-audit',
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
    ])
      expect(snapshot.entries.some((entry) => entry.path === `prompts/${name}.yaml`)).toBe(true);
  });
});
