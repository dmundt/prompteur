# ADR Index

ADR index. Agent rules: [AGENTS.md](./AGENTS.md).

## Find the right decision

| If you need to...                                         | Read                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Review the superseded individual-YAML decision            | [001-yaml-source-of-truth.md](./001-yaml-source-of-truth.md)                 |
| Understand why prompts use Markdown with YAML frontmatter | [004-markdown-frontmatter-prompts.md](./004-markdown-frontmatter-prompts.md) |
| Understand why the UI uses native editors and views       | [002-native-workbench.md](./002-native-workbench.md)                         |
| Understand the filesystem, trust, and safety boundaries   | [003-local-safety-boundaries.md](./003-local-safety-boundaries.md)           |

## All ADRs

| Number | Title                                          | Status     | File                                                                         |
| ------ | ---------------------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| 001    | Individual YAML Files Are Authoritative        | Superseded | [001-yaml-source-of-truth.md](./001-yaml-source-of-truth.md)                 |
| 002    | Use Native Editors and Views                   | Accepted   | [002-native-workbench.md](./002-native-workbench.md)                         |
| 003    | Explicit Local Safety Boundaries               | Accepted   | [003-local-safety-boundaries.md](./003-local-safety-boundaries.md)           |
| 004    | Markdown Frontmatter Prompts Are Authoritative | Accepted   | [004-markdown-frontmatter-prompts.md](./004-markdown-frontmatter-prompts.md) |

## Index Rules

- Add new ADRs to the table and relevant topic row in the same change.
- On supersession, sync status and link the replacement.
- Match titles to ADR headings, excluding `ADR NNN:`.
- Update links after rename, move, or deletion.
- Do not duplicate decision text.
