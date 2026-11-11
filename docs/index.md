# Documentation Index

Router for the documentation in this folder. Start here, then open the document that matches your task.

## Find the right document

| If you need to...                                   | Read                                 |
| --------------------------------------------------- | ------------------------------------ |
| Understand the release boundaries                   | [mvp-scope.md](./mvp-scope.md)       |
| Understand the component layout                     | [architecture.md](./architecture.md) |
| Change prompt file format, paths, or validation     | [storage.md](./storage.md)           |
| Change commands, `LibraryService`, or `SearchIndex` | [api.md](./api.md)                   |
| Change tree icons                                   | [icons.md](./icons.md)               |
| Check test, build, or verification expectations     | [verification.md](./verification.md) |
| Check clean-room implementation constraints         | [clean-room.md](./clean-room.md)     |
| Understand why a decision was made                  | [adr/](./adr/)                       |
| Follow agent rules for the docs                     | [AGENTS.md](./AGENTS.md)             |
| Follow agent rules for ADRs                         | [adr/AGENTS.md](./adr/AGENTS.md)     |

## Architecture Decision Records

- [ADR 001: Individual YAML Files Are Authoritative](./adr/001-yaml-source-of-truth.md) (superseded)
- [ADR 002: Use Native Editors and Views](./adr/002-native-workbench.md)
- [ADR 003: Explicit Local Safety Boundaries](./adr/003-local-safety-boundaries.md)
- [ADR 004: Markdown Frontmatter Prompts Are Authoritative](./adr/004-markdown-frontmatter-prompts.md)

## Update rules

- Add every new document to the table above, or to the ADR list for new ADRs, in the same change that creates it.
- Remove or relink entries in the same change that renames, moves, or deletes a document.
- Keep each row's task description short and tied to the document's topic. Do not duplicate document content here.
- Keep titles in this index identical to each document's first `#` heading.
- Update this index whenever [AGENTS.md](./AGENTS.md) or [adr/AGENTS.md](./adr/AGENTS.md) changes its scope.
