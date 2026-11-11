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

const metadata = {
  version: z.literal(1),
  name: z.string().trim().min(1),
  description: z.string().default(''),
  category: categorySchema,
  tags: labels.default([]),
};
export const promptFrontmatterSchema = z.object(metadata).strict();
export const promptSchema = promptFrontmatterSchema.extend({ content: z.string() }).strict();
export type PromptMetadata = z.infer<typeof promptFrontmatterSchema>;
export type PromptData = z.infer<typeof promptSchema>;
export type Scope = 'user' | 'workspace';
export const promptFolder = 'prompts';
export class PromptDocumentError extends Error {
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(message);
  }
}
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

function parseFrontmatter(source: string, offset: number): Document {
  assertTextBudget(source);
  const document = parseDocument(source, { uniqueKeys: true, prettyErrors: true });
  if (document.errors.length)
    throw new PromptDocumentError(
      document.errors
        .slice(0, 8)
        .map((error) => error.message.slice(0, 256))
        .join('\n')
        .slice(0, 2048),
      Math.min(offset + (document.errors[0]?.pos[0] ?? 0), offset + Math.max(0, source.length - 2)),
    );
  let nodes = 0;
  visit(document, (_, node, path) => {
    if (++nodes > 50_000 || path.length > yamlDepthLimit)
      throw new PromptDocumentError('YAML structure exceeds node/depth limit', offset);
    if (isAlias(node))
      throw new PromptDocumentError('YAML aliases are not supported; use literal values', offset);
  });
  if (!isMap(document.contents))
    throw new PromptDocumentError('YAML document must be a mapping', offset);
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

interface MarkdownParts {
  frontmatter: string;
  body: string;
  lineEnding: '\n' | '\r\n';
  bom: string;
  frontmatterOffset: number;
}

function splitMarkdown(source: string): MarkdownParts {
  assertTextBudget(source);
  const bom = source.startsWith('\uFEFF') ? '\uFEFF' : '';
  const text = bom ? source.slice(1) : source;
  const openingEnd = text.indexOf('\n');
  if (openingEnd < 0 || text.slice(0, openingEnd).replace(/\r$/, '') !== '---')
    throw new PromptDocumentError(
      'Prompt must begin with a YAML frontmatter delimiter (---)',
      bom.length,
    );
  const lineEnding = text[openingEnd - 1] === '\r' ? '\r\n' : '\n';
  const frontmatterStart = openingEnd + 1;
  let lineStart = frontmatterStart;
  while (lineStart <= text.length) {
    const newline = text.indexOf('\n', lineStart);
    const lineEnd = newline < 0 ? text.length : newline;
    const line = text.slice(lineStart, lineEnd).replace(/\r$/, '');
    if (line === '---')
      return {
        frontmatter: text.slice(frontmatterStart, lineStart),
        body: newline < 0 ? '' : text.slice(newline + 1),
        lineEnding,
        bom,
        frontmatterOffset: bom.length + frontmatterStart,
      };
    if (newline < 0) break;
    lineStart = newline + 1;
  }
  throw new PromptDocumentError(
    'Prompt frontmatter is missing a closing --- delimiter',
    source.length,
  );
}

export function decodeMarkdown(
  source: string,
  allowedCategories: readonly string[] = promptCategories,
): PromptData {
  const parts = splitMarkdown(source);
  const value = parseFrontmatter(parts.frontmatter, parts.frontmatterOffset).toJS({
    maxAliasCount: 0,
  });
  const result = promptFrontmatterSchema.safeParse(value);
  if (!result.success)
    throw new PromptDocumentError(
      result.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')
        .slice(0, 2048),
      parts.frontmatterOffset,
    );
  let category: string;
  try {
    category = normalizeCategory(result.data.category, allowedCategories);
  } catch (error) {
    throw new PromptDocumentError(
      error instanceof Error ? error.message : String(error),
      parts.frontmatterOffset,
    );
  }
  return {
    ...result.data,
    category,
    content: parts.body,
  };
}

export function encodeMarkdown(
  data: PromptData,
  previous?: string,
  allowedCategories: readonly string[] = promptCategories,
): string {
  const checked = promptSchema.parse(data);
  checked.category = normalizeCategory(checked.category, allowedCategories);
  const parts = previous === undefined ? undefined : splitMarkdown(previous);
  const document = parts
    ? parseFrontmatter(parts.frontmatter, parts.frontmatterOffset)
    : parseDocument('{}');
  const existing = document.toJS({ maxAliasCount: 0 }) as Record<string, unknown>;
  const frontmatterData: PromptMetadata = {
    version: checked.version,
    name: checked.name,
    description: checked.description,
    category: checked.category,
    tags: checked.tags,
  };
  const frontmatterOrder = ['version', 'name', 'description', 'category', 'tags'];
  for (const [key, value] of Object.entries(frontmatterData)) {
    if (
      parts &&
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
          const rank = (key: string) => {
            const index = frontmatterOrder.indexOf(key);
            return node === document.contents && index >= 0 ? index : frontmatterOrder.length;
          };
          return rank(leftKey) - rank(rightKey) || leftKey.localeCompare(rightKey, 'en');
        });
      },
    });
  }
  const lineEnding = parts?.lineEnding ?? '\n';
  const encodedFrontmatter = document.toString({ lineWidth: 0 }).replace(/\n/g, lineEnding);
  const output = `${parts?.bom ?? ''}---${lineEnding}${encodedFrontmatter}---${lineEnding}${checked.content}`;
  assertTextBudget(output);
  return output;
}

export function isPromptMarkdown(path: string): boolean {
  return /\.prompt\.md$/i.test(path);
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
