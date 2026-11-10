import type { Entry } from '../core/documents';

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
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const candidates =
      category === undefined
        ? this.entries.values()
        : [...(this.categories.get(category.trim().toLowerCase()) ?? [])].map((key) =>
            this.entries.get(key)!,
          );
    return [...candidates]
      .filter((item) =>
        terms.every((term) =>
          term.startsWith('tag:')
            ? term.length === 4 || item.tags.includes(term.slice(4))
            : item.text.includes(term),
        ),
      )
      .map((item) => item.entry)
      .sort(
        (left, right) =>
          left.data.name.localeCompare(right.data.name) || left.path.localeCompare(right.path),
      );
  }
}
