import { assertTextBudget, generatedByteLimit } from './limits';

export const variableKeys = ['selection', 'clipboard', 'filename', 'workspace', 'text'] as const;
export type VariableKey = (typeof variableKeys)[number];
export type Context = Partial<Record<VariableKey, string>>;

export function variableTokens(
  content: string,
): { name: VariableKey; start: number; length: number }[] {
  const tokens: { name: VariableKey; start: number; length: number }[] = [];
  assertTextBudget(content, generatedByteLimit);
  let cursor = 0;
  while (cursor < content.length) {
    const opening = content.indexOf('{{', cursor);
    const strayClose = content.indexOf('}}', cursor);
    if (strayClose >= 0 && (opening < 0 || strayClose < opening))
      throw new Error('Unbalanced variable braces');
    if (opening < 0) break;
    const closing = content.indexOf('}}', opening + 2);
    if (closing < 0) throw new Error('Unbalanced variable braces');
    const name = content.slice(opening + 2, closing).trim();
    if (!(variableKeys as readonly string[]).includes(name))
      throw new Error(`Unsupported variable: ${name.slice(0, 80)}`);
    tokens.push({ name: name as VariableKey, start: opening, length: closing + 2 - opening });
    cursor = closing + 2;
  }
  return tokens;
}

export function generate(
  content: string,
  context: Context,
): { text: string; missing: VariableKey[] } {
  const combined = content;
  const tokens = variableTokens(combined);
  const missing = [
    ...new Set(
      tokens
        .filter((token) => token.name !== 'selection' && !context[token.name])
        .map((token) => token.name),
    ),
  ];
  const parts: string[] = [];
  const sizes = new Map<VariableKey, number>();
  let cursor = 0;
  let bytes = 0;
  for (const token of tokens) {
    const literal = combined.slice(cursor, token.start);
    const value = context[token.name] ?? '';
    const size = sizes.get(token.name) ?? Buffer.byteLength(value);
    sizes.set(token.name, size);
    bytes += Buffer.byteLength(literal) + size;
    if (bytes > generatedByteLimit) throw new Error('Generated prompt exceeds byte limit');
    parts.push(literal, value);
    cursor = token.start + token.length;
  }
  const tail = combined.slice(cursor);
  if (bytes + Buffer.byteLength(tail) > generatedByteLimit)
    throw new Error('Generated prompt exceeds byte limit');
  parts.push(tail);
  const text = parts.join('').replace(/(?:\r?\n[ \t]*){3,}/g, (lines) => {
    const newline = lines.startsWith('\r\n') ? '\r\n' : '\n';
    return newline + newline;
  });
  return { text, missing };
}
