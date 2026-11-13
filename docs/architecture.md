# Architecture

- Local desktop VS Code extension. No server, webview, cloud SDK, or provider framework.

- `core/documents.ts`: Markdown prompt parsing with metadata-only YAML frontmatter, runtime-approved categories, bounded body text, path checks, and path-based identity.
- `core/render.ts`: bounded one-pass substitution of five fixed variables.
- `workbench/text-input.ts`: per-window native single-line input lifecycle. No extension-owned input persistence.
- `application/library.ts`: lazy per-scope cache, serialized writes/reloads, validation problems, and notifications.
- `application/search.ts`: cached raw/normalized fields, exact tag/category filters, shared exact/full-text/bounded-fuzzy matching, and relevance/name ordering. Cross-scope phase selection precedes Copilot candidate limits.
- `platform/local-files.ts`: reads/scans, expected-source writes/deletes, locks, atomic replacement, and symlink protection.
- `workbench`: one category tree with allowlisted metadata links, native editor diagnostics/highlighting, debounced watchers, snapshot previews, and commands.
- `workbench/prompt-tool.ts`: optional read-only VS Code Language Model Tool for user-approved Copilot prompt search/rendering; no direct model requests.

- Filesystem port exists for tests, not speculative providers. Core/application do not import VS Code.
- No library-path configuration, ordering/usage sidecar, or generic transfer protocol.

- Library reads deduplicate concurrent initial loads. Initial reads use at most 16 workers per scope.
- Activation starts eager reads of available libraries in the background for filtered scope counts and their sum on an initially expanded Prompts root. When the Prompteur view becomes visible, reveal and expand Prompts and available User/Workspace scopes without selecting rows. Counts follow per-scope tree search; category count modes remain independent. No Activity Bar count badge.
- Cache stores source plus decoded prompt or validation error.
- Watchers debounce 80 ms; publish one snapshot per burst. Create/delete rescans; edits reload changed files.
- Enforce input budgets. Batch categories above 200 children.

- Generation captures source editor before pickers, uses valid dirty prompts, and expands once.
- **Copy Text** writes generated text to OS clipboard without editing source; composer insertion is unavailable through a supported API.
- Copilot prompt-tool results include matched prompt content and requested variable context; tool use is confirmed by VS Code.
- **Copy Prompt/Paste Prompt** use a Workbench-local prompt buffer to create copies; never move sources or persist transfer state. Paste is enabled when the buffer is populated.
- Preview opens an untitled plaintext snapshot. A weak set excludes previews as selection sources; no retained context/provider/timer.

- Workbench checks Workspace Trust before Workspace prompt use. Filesystem adapter checks Workspace writes/deletes.
- User prompts remain available. Native saves are not reformatted.

- Seven built-in categories plus profile-approved categories in VS Code state.
- Discover only `.prompt.md`. Ignore existing YAML prompts; no compatibility reader/converter.

- No import/export, archive format, or transfer layer.
- Prompt copies use a window-local buffer. Starters skip occupied paths.
- Starter installation reports partial progress; no multi-file transaction.

- Persist approved categories in extension state; store view preferences in native VS Code settings.
- Ignore/preserve other legacy state and non-prompt files.
