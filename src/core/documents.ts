import { z } from 'zod';
import { isAlias, isMap, isScalar, parseDocument, visit, type Document } from 'yaml';
import { assertTextBudget, yamlDepthLimit } from './limits';

export const relativePath = z
  .string()
  .min(1)
  .refine(
    (value) =>
      !value.includes('\\') &&
      !value.includes(':') &&
      !value.includes('\0') &&
      value
        .split('/')
        .every(
          (part) =>
            part !== '' &&
            part !== '.' &&
            part !== '..' &&
            !/[<>"|?*]/.test(part) &&
            !/[ .]$/.test(part) &&
            !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(part),
        ),
    'Use a safe relative path without traversal',
  );
const labels = z.array(z.string().trim().min(1)).max(128);
export const promptCategories = [
  'explain',
  'plan',
  'implement',
  'review',
  'test',
  'debug',
  'document',
] as const;
export type PromptCategory = (typeof promptCategories)[number];
const categorySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .describe(
    `Built-in categories: ${promptCategories.join(', ')}. User-approved profile categories are also valid.`,
  );

const base = {
  version: z.literal(1),
  name: z.string().trim().min(1),
  description: z.string().default(''),
  category: categorySchema,
  tags: labels.default([]),
  content: z.string(),
};
export const promptSchema = z.object(base).strict();
export const legacyPromptSchema = z
  .object({ ...base, category: z.string().trim().min(1).default('misc') })
  .strict();
export type PromptData = z.infer<typeof promptSchema>;
export type LegacyPromptData = z.infer<typeof legacyPromptSchema>;
export type Scope = 'user' | 'workspace';
export const promptFolder = 'prompts';
export interface Entry {
  key: string;
  scope: Scope;
  path: string;
  data: PromptData;
  source: string;
}
export interface Problem {
  path: string;
  message: string;
}
export interface Snapshot {
  entries: Entry[];
  problems: Problem[];
}

const keyOrder = ['version', 'name', 'description', 'category', 'tags', 'content'];

export function parseYaml(source: string): Document {
  assertTextBudget(source);
  const document = parseDocument(source, { uniqueKeys: true, prettyErrors: true });
  if (document.errors.length)
    throw new Error(
      document.errors
        .slice(0, 8)
        .map((error) => error.message.slice(0, 256))
        .join('\n')
        .slice(0, 2048),
    );
  let nodes = 0;
  visit(document, (_, node, path) => {
    if (++nodes > 50_000 || path.length > yamlDepthLimit)
      throw new Error('YAML structure exceeds node/depth limit');
    if (isAlias(node)) throw new Error('YAML aliases are not supported; use literal values');
  });
  if (!isMap(document.contents)) throw new Error('YAML document must be a mapping');
  return document;
}

export function normalizeCategory(
  category: string,
  allowedCategories: readonly string[] = promptCategories,
): string {
  const normalized = category.trim().toLowerCase();
  const allowed = [...new Set(allowedCategories.map((value) => value.trim().toLowerCase()))];
  if (!allowed.includes(normalized))
    throw new Error(
      `category: Choose one of ${allowed.join(', ')}. Add this category to the approved profile categories before using it.`,
    );
  return normalized;
}

export function decodeYaml(
  source: string,
  allowedCategories: readonly string[] = promptCategories,
): PromptData {
  const value = parseYaml(source).toJS({ maxAliasCount: 0 });
  const result = promptSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      result.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
        .slice(0, 2048),
    );
  return { ...result.data, category: normalizeCategory(result.data.category, allowedCategories) };
}

export function decodeLegacyYaml(source: string): LegacyPromptData {
  const result = legacyPromptSchema.safeParse(parseYaml(source).toJS({ maxAliasCount: 0 }));
  if (!result.success)
    throw new Error(
      result.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
        .slice(0, 2048),
    );
  return result.data;
}

export function encodeYaml(
  data: PromptData,
  previous?: string,
  allowedCategories: readonly string[] = promptCategories,
): string {
  const checked = promptSchema.parse(data);
  checked.category = normalizeCategory(checked.category, allowedCategories);
  const document = previous === undefined ? parseDocument('{}') : parseYaml(previous);
  const existing = document.toJS({ maxAliasCount: 0 }) as Record<string, unknown>;
  for (const [key, value] of Object.entries(checked)) {
    if (
      previous !== undefined &&
      !Object.hasOwn(existing, key) &&
      ((key === 'description' && value === '') ||
        (key === 'tags' && Array.isArray(value) && value.length === 0))
    )
      continue;
    if (JSON.stringify(existing[key]) !== JSON.stringify(value)) {
      const node = document.get(key, true);
      if (isScalar(node) && (typeof value !== 'object' || value === null)) node.value = value;
      else document.set(key, document.createNode(value));
    }
  }
  if (isMap(document.contents)) {
    visit(document, {
      Map: (_, node) => {
        node.flow = false;
        node.items.sort((left, right) => {
          const leftKey = String(left.key);
          const rightKey = String(right.key);
          const rank = (key: string) =>
            node === document.contents && keyOrder.indexOf(key) >= 0
              ? keyOrder.indexOf(key)
              : keyOrder.length;
          return rank(leftKey) - rank(rightKey) || leftKey.localeCompare(rightKey, 'en');
        });
      },
    });
    const content = document.get('content', true);
    if (isScalar(content) && typeof content.value === 'string' && content.value.includes('\n'))
      content.type = 'BLOCK_LITERAL';
  }
  const result = document.toString({ lineWidth: 0 });
  assertTextBudget(result);
  return result;
}

export function newPrompt(name: string, category: string = 'explain'): PromptData {
  return {
    version: 1,
    name,
    description: '',
    category,
    tags: [],
    content: '',
  };
}

export function entryKey(scope: Scope, path: string): string {
  return `${scope}:${path}`;
}
export function isYaml(path: string): boolean {
  return /\.ya?ml$/i.test(path);
}
