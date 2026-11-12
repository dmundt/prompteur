import type { Entry } from '../core/documents';

type SearchTerm = { kind: 'text' | 'tag' | 'category'; value: string };

export interface SearchOptions {
  matching: 'exact' | 'fullText' | 'fuzzy';
  caseSensitive: boolean;
  ranking: 'relevance' | 'name';
}

export const defaultSearchOptions: Readonly<SearchOptions> = {
  matching: 'fullText',
  caseSensitive: false,
  ranking: 'relevance',
};

export interface SearchMatch {
  entry: Entry;
  phase: number;
  relevance: number;
}

export function rankMatches(matches: SearchMatch[], options: SearchOptions): SearchMatch[] {
  const phase = matches.reduce((highest, match) => Math.max(highest, match.phase), -1);
  return matches
    .filter((match) => match.phase === phase)
    .sort(
      (left, right) =>
        (options.ranking === 'relevance' ? right.relevance - left.relevance : 0) ||
        left.entry.data.name.localeCompare(right.entry.data.name) ||
        left.entry.scope.localeCompare(right.entry.scope) ||
        left.entry.path.localeCompare(right.entry.path),
    );
}

function editDistance(left: string, right: string, limit: number): number {
  if (Math.abs(left.length - right.length) > limit) return limit + 1;
  let previous = Array.from({ length: Math.min(right.length, limit) + 1 }, (_, index) => index);
  let previousStart = 0;
  for (let row = 1; row <= left.length; row++) {
    const start = Math.max(0, row - limit);
    const end = Math.min(right.length, row + limit);
    const current: number[] = [];
    let minimum = limit + 1;
    for (let column = start; column <= end; column++) {
      const distance =
        column === 0
          ? row
          : Math.min(
              (previous[column - previousStart] ?? limit + 1) + 1,
              (current[column - start - 1] ?? limit + 1) + 1,
              (previous[column - previousStart - 1] ?? limit + 1) +
                (left[row - 1] === right[column - 1] ? 0 : 1),
            );
      current.push(distance);
      minimum = Math.min(minimum, distance);
    }
    if (minimum > limit) return limit + 1;
    previous = current;
    previousStart = start;
  }
  return previous[right.length - previousStart]!;
}

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
          return { kind: 'text', value: token };
        }
      }
      return { kind, value: value.toLowerCase() };
    }
  }
  return { kind: 'text', value: token };
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
    {
      entry: Entry;
      raw: { name: string; metadata: string; body: string };
      normalized: { name: string; metadata: string; body: string };
      tags: string[];
      category: string;
    }
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
      const raw = {
        name: data.name.trim(),
        metadata: [data.description, data.category, entry.path, ...data.tags].join('\n'),
        body: data.content,
      };
      this.entries.set(entry.key, {
        entry,
        raw,
        normalized: {
          name: raw.name.toLowerCase(),
          metadata: raw.metadata.toLowerCase(),
          body: raw.body.toLowerCase(),
        },
        tags: data.tags.map((tag) => tag.toLowerCase()),
        category,
      });
      const keys = this.categories.get(category) ?? new Set<string>();
      keys.add(entry.key);
      this.categories.set(category, keys);
    }
  }

  query(query = '', category?: string, options: SearchOptions = defaultSearchOptions): Entry[] {
    return rankMatches(this.matches(query, category, options), options).map((match) => match.entry);
  }

  matches(query: string, category: string | undefined, options: SearchOptions): SearchMatch[] {
    const tokens = tokenize(query);
    const terms = tokens.map(parseTerm);
    const text = terms.filter((term) => term.kind === 'text').map((term) => term.value);
    let nameQuery = '';
    let cursor = 0;
    let afterFilter = false;
    for (const [index, token] of tokens.entries()) {
      const start = query.indexOf(token, cursor);
      if (terms[index]!.kind === 'text') {
        nameQuery += `${nameQuery ? (afterFilter ? ' ' : query.slice(cursor, start)) : ''}${token}`;
        afterFilter = false;
      } else {
        afterFilter = true;
      }
      cursor = start + token.length;
    }
    const normalizedQuery = options.caseSensitive ? nameQuery : nameQuery.toLowerCase();
    const words = text.map((word) => (options.caseSensitive ? word : word.toLowerCase()));
    const candidates =
      category === undefined
        ? this.entries.values()
        : [...(this.categories.get(category.trim().toLowerCase()) ?? [])].map((key) =>
            this.entries.get(key)!,
          );
    const eligible = [...candidates].filter((item) =>
      terms.every((term) => {
        if (!term.value || term.kind === 'text') return true;
        if (term.kind === 'tag') return item.tags.includes(term.value);
        return item.category === term.value;
      }),
    );
    if (!words.length) return eligible.map(({ entry }) => ({ entry, phase: 1, relevance: 0 }));
    const matches: SearchMatch[] = [];
    for (const item of eligible) {
      const fields = options.caseSensitive ? item.raw : item.normalized;
      if (fields.name === normalizedQuery) {
        matches.push({ entry: item.entry, phase: 2, relevance: 5 });
        continue;
      }
      if (options.matching === 'exact') continue;
      const relevance = words.reduce(
        (lowest, word) =>
          Math.min(
            lowest,
            fields.name.startsWith(word)
              ? 4
              : fields.name.includes(word)
                ? 3
                : fields.metadata.includes(word)
                  ? 2
                  : fields.body.includes(word)
                    ? 1
                    : 0,
          ),
        4,
      );
      if (relevance) {
        matches.push({ entry: item.entry, phase: 1, relevance });
        continue;
      }
      if (options.matching !== 'fuzzy' || normalizedQuery.length < 4) continue;
      const limit = normalizedQuery.length < 8 ? 1 : 2;
      const distance = editDistance(normalizedQuery, fields.name, limit);
      if (distance <= limit) matches.push({ entry: item.entry, phase: 0, relevance: -distance });
    }
    return matches;
  }
}
