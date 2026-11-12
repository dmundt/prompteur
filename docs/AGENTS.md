# AGENTS.md

Rules for API/command code and docs. Source: [api.md](./api.md).

- Start at [index.md](./index.md); sync additions, renames, and removals.

## Public surface

- No public prompt-library API without explicit request.
- Keep approved `prompteur_findPrompt` as one read-only VS Code Language Model Tool; do not add direct provider calls or mutations.
- Tree arguments are private; palette commands select scope/prompt when needed.

## Error and cancellation behavior

- Async failures show native errors and reject.
- Cancellation does not mutate.

## LibraryService

- Filesystem port: `list`, `read`, expected-source `write`/`remove`.
- Operations: lazy `get`, incremental/full `refresh`, configurable `search`/internal `searchRanked`, validated `save`/`writeSource`, `delete`, subscriptions.
- Snapshots contain entries/problems; treat as immutable.

## SearchIndex

- Reuse normalized text for unchanged entries.
- Share matching/case/ranking between library filtering and Copilot. Exact names precede full text; optional bounded fuzzy name fallback runs last. Tag/category filters remain exact and case-insensitive.
- Rank by relevance or name; empty/filter-only queries stay alphabetical. Identity sorting never breaks semantic ties for Copilot selection.
- `generate(content, context)` returns `{ text, missing }`; support exactly four variables.

## Commands

- Do not make direct model requests or insert into Chat. The user-approved `prompteur_findPrompt` Language Model Tool is read-only; its returned prompt text and requested variables become Copilot model context.
- Sync command changes with [api.md](./api.md).
- `prompteur.copy`/`prompteur.preview` only produce output; **Copy Text** copies to the clipboard because VS Code exposes no supported composer insertion API. Preview opens independent plaintext snapshot.
