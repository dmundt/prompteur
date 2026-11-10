import { mkdir, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { format } from 'prettier';
import { promptSchema } from '../src/core/documents';

async function generate(): Promise<void> {
  await mkdir('schemas', { recursive: true });
  const schemas: Record<string, z.ZodType> = {
    prompt: promptSchema,
  };
  for (const [name, schema] of Object.entries(schemas)) {
    const json = z.toJSONSchema(schema, { target: 'draft-7', io: 'input' });
    await writeFile(
      `schemas/${name}.schema.json`,
      await format(JSON.stringify(json), { parser: 'json', printWidth: 100 }),
      'utf8',
    );
  }
}

void generate().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
