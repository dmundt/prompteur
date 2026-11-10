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
const base = {
  version: z.literal(1),
  name: z.string().trim().min(1),
  description: z.string().default(''),
  category: z.string().trim().min(1).default('misc'),
  tags: labels.default([]),
  content: z.string(),
};
export const promptSchema = z.object(base).strict();
export type PromptData = z.infer<typeof promptSchema>;
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

export function decodeYaml(source: string): PromptData {
  const result = promptSchema.safeParse(parseYaml(source).toJS({ maxAliasCount: 0 }));
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

export function encodeYaml(data: PromptData, previous?: string): string {
  const checked = promptSchema.parse(data);
  const document = previous === undefined ? parseDocument('{}') : parseYaml(previous);
  const existing = document.toJS({ maxAliasCount: 0 }) as Record<string, unknown>;
  for (const [key, value] of Object.entries(checked)) {
    if (
      previous !== undefined &&
      !Object.hasOwn(existing, key) &&
      ((key === 'description' && value === '') ||
        (key === 'category' && value === 'misc') ||
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

export function newPrompt(name: string): PromptData {
  return {
    version: 1,
    name,
    description: '',
    category: 'misc',
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
