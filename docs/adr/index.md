# ADR Index

Router for the Architecture Decision Records in this folder. Find the decision that matches your task, then open its file. Agent rules for this folder are in [AGENTS.md](./AGENTS.md).

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

## Update rules

- Add a row to the "All ADRs" table in the same change that creates a new ADR. Add a row to "Find the right decision" when the ADR answers a distinct question.
- When an ADR is superseded, change its status in this table to match the file's `Status:` line, and link the superseding ADR.
- Keep titles identical to each ADR's first `#` heading, minus the `ADR NNN:` prefix.
- Relink entries in the same change that renames, moves, or deletes an ADR file.
- Do not copy decision text into this index.
