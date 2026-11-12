# ADR Index

ADR index. Agent rules: [AGENTS.md](./AGENTS.md).

## Find the right decision

| If you need to...                                          | Read                                                                         |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Review the superseded individual-YAML decision             | [001-yaml-source-of-truth.md](./001-yaml-source-of-truth.md)                 |
| Understand why prompts use Markdown with YAML frontmatter  | [004-markdown-frontmatter-prompts.md](./004-markdown-frontmatter-prompts.md) |
| Understand why the UI uses native editors and views        | [002-native-workbench.md](./002-native-workbench.md)                         |
| Understand the original filesystem and trust boundaries    | [003-local-safety-boundaries.md](./003-local-safety-boundaries.md)           |
| Understand the Copilot prompt tool and data-sharing rules  | [005-copilot-prompt-tool.md](./005-copilot-prompt-tool.md)                   |
| Understand shared search settings and best-match selection | [006-configurable-prompt-matching.md](./006-configurable-prompt-matching.md) |

## All ADRs

| Number | Title                                          | Status                          | File                                                                         |
| ------ | ---------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| 001    | Individual YAML Files Are Authoritative        | Superseded                      | [001-yaml-source-of-truth.md](./001-yaml-source-of-truth.md)                 |
| 002    | Use Native Editors and Views                   | Accepted                        | [002-native-workbench.md](./002-native-workbench.md)                         |
| 003    | Explicit Local Safety Boundaries               | Superseded                      | [003-local-safety-boundaries.md](./003-local-safety-boundaries.md)           |
| 004    | Markdown Frontmatter Prompts Are Authoritative | Accepted                        | [004-markdown-frontmatter-prompts.md](./004-markdown-frontmatter-prompts.md) |
| 005    | Explicit Copilot Prompt Tool                   | Partially superseded by ADR 006 | [005-copilot-prompt-tool.md](./005-copilot-prompt-tool.md)                   |
| 006    | Configurable Prompt Matching                   | Accepted                        | [006-configurable-prompt-matching.md](./006-configurable-prompt-matching.md) |

## Index Rules

- Add new ADRs to the table and relevant topic row in the same change.
- On supersession, sync status and link the replacement.
- Match titles to ADR headings, excluding `ADR NNN:`.
- Update links after rename, move, or deletion.
- Do not duplicate decision text.
