# ADR 004: Markdown Frontmatter Prompts Are Authoritative

Status: Accepted. Supersedes ADR 001.

Store prompts as `.prompt.md`. Frontmatter fields: `version`, `name`, `description`, `category`, `tags`. Markdown after closing `---` is prompt content. Discover only `.prompt.md`. No YAML reader, dual-format support, or converter; leave unpublished YAML prompts untouched and ignored.

Consequences:

- Prompt text, Markdown structure, and code fences stay raw; validate metadata and retain Git diffs.
- File path remains identity.
- Category migration is separate; runtime validates profile-approved categories.
- YAML is frontmatter syntax only.
