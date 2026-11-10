# AGENTS.md

Rules extracted from [api.md](./api.md). Follow these when changing code or docs that touch the internal API or commands.

Start from [index.md](./index.md) to find the right document. Keep `index.md` in sync with any document you add, rename, or remove.

## Public surface

- No public integration/provider API is exported. Do not add one without an explicit request.
- Tree command arguments are private. Palette invocations select scope/prompt when needed.

## Error and cancellation behavior

- Asynchronous command failures display a native error and reject.
- Cancellations return without mutation.

## LibraryService

- Filesystem port must provide `list`, `read`, expected-source `write`, and expected-source `remove`.
- Provided operations: lazy `get`, incremental/full `refresh`, case-insensitive `search`, validated `save`/`writeSource`, `delete`, and subscriptions.
- Snapshots contain entries and validation problems. Consumers must treat snapshots as immutable.

## SearchIndex

- Reuse normalized text for unchanged entries.
- Apply full-text and exact-tag filters.
- Return results in alphabetical order.
- `generate(content, context)` returns `{ text, missing }` and supports exactly the four defined variables.

## Commands

- Commands must not invoke AI tools or insert directly into Chat.
- Command IDs and actions are defined in [api.md](./api.md); keep that table in sync when adding or changing commands.
- `prompteur.copy` and `prompteur.preview` produce output only; `prompteur.preview` opens an independent plaintext snapshot.
