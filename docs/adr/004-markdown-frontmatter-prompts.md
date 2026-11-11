# ADR 004: Markdown Frontmatter Prompts Are Authoritative

Status: Accepted. Supersedes ADR 001.

Store each prompt as a `.prompt.md` file. YAML frontmatter contains only `version`, `name`, `description`, `category`, and `tags`; the Markdown body after the closing `---` delimiter is prompt content. Discover only this format. Do not retain a YAML prompt reader, dual-format support, or format converter; existing YAML prompt files remain untouched and ignored because the extension is unpublished.

Consequences: prompt prose, Markdown structure, and code fences remain natural text while metadata stays validated and source-control friendly. File paths remain prompt identity. Category migration is not part of the format; profile-approved categories remain runtime validated. YAML continues as the frontmatter serialization format only.
