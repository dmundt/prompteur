# Architecture

- Local desktop VS Code extension. No server, webview, cloud SDK, or provider framework.

- `core/documents.ts`: Markdown prompt parsing with metadata-only YAML frontmatter, runtime-approved categories, bounded body text, path checks, and path-based identity.
- `core/render.ts`: bounded one-pass substitution of four fixed variables.
- `application/library.ts`: lazy per-scope cache, serialized writes/reloads, validation problems, and notifications.
- `application/search.ts`: reused lowercase search text, exact tags, and alphabetical results.
- `platform/local-files.ts`: reads/scans, expected-source writes/deletes, locks, atomic replacement, and symlink protection.
- `workbench`: one category tree with allowlisted metadata links, native editor diagnostics/highlighting, debounced watchers, snapshot previews, and commands.

- Filesystem port exists for tests, not speculative providers. Core/application do not import VS Code.
- No library-path configuration, ordering/usage sidecar, or generic transfer protocol.

- Tree expansion deduplicates lazy loads. Initial reads use at most 16 workers.
- Cache stores source plus decoded prompt or validation error.
- Watchers debounce 80 ms; publish one snapshot per burst. Create/delete rescans; edits reload changed files.
- Enforce input budgets. Batch categories above 200 children.

- Generation captures source editor before pickers, uses valid dirty prompts, and expands once.
- **Copy** writes generated text to OS clipboard without editing source.
- **Copy Prompt/Paste Prompt** use a Workbench-local buffer to create copies; never move sources or persist transfer state.
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
