# Architecture

Prompteur is a local desktop VS Code extension without a server, webview, cloud SDK, or provider framework.

- `core/documents.ts`: six-field prompt validation with seven canonical categories, YAML parsing/serialization, path checks, and path-based identity.
- `core/render.ts`: bounded one-pass substitution of four fixed variables.
- `application/library.ts`: lazy per-scope cache, serialized writes/reloads, validation problems, and notifications.
- `application/search.ts`: reused lowercase search text, exact tags, and alphabetical results.
- `platform/local-files.ts`: reads/scans, expected-source writes/deletes, locks, atomic replacement, and symlink protection.
- `workbench`: one category tree, native editor diagnostics/highlighting, debounced watchers, snapshot previews, and commands.

The small filesystem port exists for testability, not hypothetical storage providers. Core/application code does not import VS Code. No ordering, metadata store, generic transfer protocol, or library settings remains.

Tree expansion deduplicates lazy loads. Initial reads use at most sixteen workers; cache entries hold source, decoded prompt, or validation error. Watcher changes debounce for 80 ms, publishing one snapshot per burst. File creation/deletion triggers a rescan; content edits reload the changed files. Input budgets remain enforced. Categories with more than 200 children are batched.

Generation captures the source editor before pickers, uses valid dirty prompt buffers when present, and expands once. **Copy** writes generated text to the OS clipboard without editing source documents. **Copy Prompt/Paste Prompt** use an in-memory buffer owned by the Workbench instance to create new prompt files across scopes/categories; they do not move sources or persist transfer state. Preview opens an untitled plaintext document with generated content. A weak set excludes previews as selection sources; there is no retained preview context, provider, or update timer.

The workbench checks Workspace Trust before using workspace prompts; the filesystem adapter independently checks it before workspace writes/deletes. User prompts remain available. Native document saves are not reformatted by the extension.

Category migration is explicit: legacy prompts remain repairable problems until the user previews and confirms source-aware rewrites. There is no automatic migration during loading.

No file import/export commands, archive format, or generic transfer layer exists. Prompt-record copies use the small window-local buffer. Starters are copied directly, skipping occupied paths. Multi-file starter installation reports partial progress rather than emulating a transaction.

No UI state is persisted. Existing legacy state and non-prompt files are ignored and preserved.
