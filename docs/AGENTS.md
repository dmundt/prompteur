# AGENTS.md

Rules for API/command code and docs. Source: [api.md](./api.md).

- Start at [index.md](./index.md); sync additions, renames, and removals.

## Public surface

- No public integration/provider API without explicit request.
- Tree arguments are private; palette commands select scope/prompt when needed.

## Error and cancellation behavior

- Async failures show native errors and reject.
- Cancellation does not mutate.

## LibraryService

- Filesystem port: `list`, `read`, expected-source `write`/`remove`.
- Operations: lazy `get`, incremental/full `refresh`, case-insensitive `search`, validated `save`/`writeSource`, `delete`, subscriptions.
- Snapshots contain entries/problems; treat as immutable.

## SearchIndex

- Reuse normalized text for unchanged entries.
- Filter full text and exact tags; sort alphabetically.
- `generate(content, context)` returns `{ text, missing }`; support exactly four variables.

## Commands

- Never invoke AI tools or insert into Chat.
- Sync command changes with [api.md](./api.md).
- `prompteur.copy`/`prompteur.preview` only produce output; Preview opens independent plaintext snapshot.
