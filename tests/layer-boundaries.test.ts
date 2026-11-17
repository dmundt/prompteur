import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

describe('layer boundaries', () => {
  it.each([
    ['src/core/example.ts', 'vscode'],
    ['src/core/example.ts', '../application/library'],
    ['src/core/example.ts', '../platform/local-files'],
    ['src/core/example.ts', '../workbench/tree'],
    ['src/core/nested/example.ts', '../../application/library'],
    ['src/core/nested/example.ts', '../../platform'],
    ['src/application/example.ts', 'vscode'],
    ['src/application/example.ts', '../platform/local-files'],
    ['src/application/example.ts', '../workbench/tree'],
    ['src/application/nested/example.ts', '../../workbench/tree'],
  ])('rejects %s importing %s', async (filePath, dependency) => {
    const [result] = await new ESLint().lintText(`import '${dependency}';`, { filePath });
    expect(result?.messages.some((message) => message.ruleId === 'no-restricted-imports')).toBe(
      true,
    );
  });

  it('allows application code to import core', async () => {
    const [result] = await new ESLint().lintText("import '../core/documents';", {
      filePath: 'src/application/example.ts',
    });
    expect(result?.messages).toEqual([]);
  });
});
