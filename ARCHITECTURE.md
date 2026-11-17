# Architecture

Prompteur is a local VS Code extension for Markdown prompt libraries.

- [`src/`](./src/) contains extension code; keep core/application logic independent of VS Code APIs.
- [`tests/`](./tests/) contains unit tests and VS Code host smoke tests.
- [`scripts/`](./scripts/) contains build and host-test helpers.
- [`docs/architecture.md`](./docs/architecture.md) describes runtime components and data flow.
- [`docs/adr/`](./docs/adr/) records architecture decisions.

Prompt files and library paths are authoritative. User prompts live in profile storage; workspace prompts live in `.vscode/prompts`. Workspace Trust gates workspace mutations, generation, and preview. The approved Copilot Language Model Tool is read-only and returns requested prompt content only after VS Code confirmation.
