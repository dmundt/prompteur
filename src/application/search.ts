import type { Entry } from '../core/documents';

type SearchTerm = { kind: 'text' | 'tag' | 'category'; value: string };

function tokenize(query: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < query.length) {
    while (/\s/.test(query[index] ?? '')) index++;
    if (index >= query.length) break;
    const start = index;
    const quotedFilter = /^(tag|category):"/i.exec(query.slice(index));
    if (quotedFilter) {
      index += quotedFilter[0].length;
      let escaped = false;
      let closed = false;
      while (index < query.length) {
        const character = query[index++]!;
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') {
          closed = true;
          break;
        }
      }
      if (!closed) {
        index = start;
        while (index < query.length && !/\s/.test(query[index]!)) index++;
      }
    } else {
      while (index < query.length && !/\s/.test(query[index]!)) index++;
    }
    tokens.push(query.slice(start, index));
  }
  return tokens;
}

function parseTerm(token: string): SearchTerm {
  const separator = token.indexOf(':');
  if (separator > 0) {
    const kind = token.slice(0, separator).toLowerCase();
    if (kind === 'tag' || kind === 'category') {
      const rawValue = token.slice(separator + 1);
      let value = rawValue;
      if (rawValue.startsWith('"')) {
        try {
          value = JSON.parse(rawValue) as string;
        } catch {
          return { kind: 'text', value: token.toLowerCase() };
        }
      }
      return { kind, value: value.toLowerCase() };
    }
  }
  return { kind: 'text', value: token.toLowerCase() };
}

export function appendExactFilter(query: string, kind: 'tag' | 'category', value: string): string {
  const normalized = value.toLowerCase();
  if (
    tokenize(query)
      .map(parseTerm)
      .some((term) => term.kind === kind && term.value === normalized)
  )
    return query;
  const current = query.trim();
  return `${current}${current ? ' ' : ''}${kind}:${JSON.stringify(value)}`;
}

export class SearchIndex {
  private readonly entries = new Map<
    string,
    { entry: Entry; text: string; tags: string[]; category: string }
  >();
  private readonly categories = new Map<string, Set<string>>();

  private remove(key: string): void {
    const item = this.entries.get(key);
    if (!item) return;
    const keys = this.categories.get(item.category)!;
    keys.delete(key);
    if (!keys.size) this.categories.delete(item.category);
    this.entries.delete(key);
  }

  update(entries: readonly Entry[]): void {
    const current = new Set(entries.map((entry) => entry.key));
    for (const key of this.entries.keys()) if (!current.has(key)) this.remove(key);
    for (const entry of entries) {
      if (this.entries.get(entry.key)?.entry === entry) continue;
      this.remove(entry.key);
      const { data } = entry;
      const category = data.category.trim().toLowerCase();
      this.entries.set(entry.key, {
        entry,
        text: [data.name, data.description, data.category, entry.path, data.content, ...data.tags]
          .join('\n')
          .toLowerCase(),
        tags: data.tags.map((tag) => tag.toLowerCase()),
        category,
      });
      const keys = this.categories.get(category) ?? new Set<string>();
      keys.add(entry.key);
      this.categories.set(category, keys);
    }
  }

  query(query = '', category?: string): Entry[] {
    const terms = tokenize(query).map(parseTerm);
    const candidates =
      category === undefined
        ? this.entries.values()
        : [...(this.categories.get(category.trim().toLowerCase()) ?? [])].map((key) =>
            this.entries.get(key)!,
          );
    return [...candidates]
      .filter((item) =>
        terms.every((term) => {
          if (!term.value) return true;
          if (term.kind === 'tag') return item.tags.includes(term.value);
          if (term.kind === 'category') return item.category === term.value;
          return item.text.includes(term.value);
        }),
      )
      .map((item) => item.entry)
      .sort(
        (left, right) =>
          left.data.name.localeCompare(right.data.name) || left.path.localeCompare(right.path),
      );
  }
}
