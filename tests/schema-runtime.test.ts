import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { LibraryService } from '../src/application/library';
import { encodeMarkdown, newPrompt, promptFrontmatterSchema } from '../src/core/documents';
import { memoryFiles } from './helpers';

describe('release boundary', () => {
  it('keeps generated schema synchronized with the frontmatter metadata model', async () => {
    const schema = JSON.parse(await readFile('schemas/prompt.schema.json', 'utf8')) as {
      properties: Record<string, unknown>;
      required: string[];
      additionalProperties: boolean;
    };
    expect(Object.keys(schema.properties).sort()).toEqual(
      Object.keys(promptFrontmatterSchema.shape).sort(),
    );
    expect(schema.required.sort()).toEqual(['category', 'name', 'version']);
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.category).toMatchObject({
      type: 'string',
      minLength: 1,
      maxLength: 64,
    });
    expect(schema.properties.category).toHaveProperty('description');
    expect(schema.properties.category).not.toHaveProperty('enum');
  });
  it('uses path identity for equal-name prompts without persistent usage or settings', async () => {
    const { port, files } = memoryFiles();
    for (const name of ['a', 'b'])
      files.set(`user:prompts/${name}.prompt.md`, encodeMarkdown(newPrompt('Same')));
    files.set('user:settings.yaml', 'version: 1\ndefaultPromptFolder: old\n');
    const snapshot = await new LibraryService(port).get('user');
    expect(snapshot.entries.map((entry) => entry.key).sort()).toEqual([
      'user:prompts/a.prompt.md',
      'user:prompts/b.prompt.md',
    ]);
    expect(Object.keys(snapshot).sort()).toEqual(['entries', 'problems']);
    expect(files.get('user:settings.yaml')).toContain('defaultPromptFolder: old');
  });
});
