# ADR 006: Configurable Prompt Matching

Status: Accepted.

Share one VS Code-independent matching engine between library filtering and the Copilot prompt tool. Native window settings select exact-only, exact-first full-text, or exact/full-text/fuzzy-name fallback; case sensitivity; relevance/name ordering; and Copilot selection policy.

Default to case-insensitive exact-first full-text matching, relevance ordering, and Best Match selection. After VS Code tool approval, Best Match returns the unique highest-relevance prompt even when lower-ranked candidates exist. Require Choice returns metadata whenever multiple candidates remain. Duplicate exact names and highest-relevance ties always remain ambiguous; alphabetical/scope/path ordering never chooses between them. Rank across eligible scopes before candidate truncation. Tree filtering retains all matching rows and never invokes prompts.

This ADR supersedes [ADR 005](./005-copilot-prompt-tool.md) only for rendering exclusively when one candidate exists. Preserve read-only access, VS Code-mediated invocation/confirmation, Workspace Trust, exact validated scope/path lookup, requested-context disclosure, and no direct provider calls.

Consequences:

- Tool confirmation, settings, and README disclose unique-best content/context sharing without a separate candidate-choice round.
- No context is read from losing or ambiguous candidates.
- Default tree order and exact-name filtering change; users can select name ordering and Require Choice. Prompt format remains version 1; no file migration.
- Fuzzy matching applies to names only, after stronger phases fail, with fixed bounded edit tolerance. No learned ranking, usage history, scope preference, or external dependencies.
