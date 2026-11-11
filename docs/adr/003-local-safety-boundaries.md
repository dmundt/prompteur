# ADR 003: Explicit Local Safety Boundaries

Status: Accepted.

Keep core/application independent of VS Code through a small filesystem port. Serialize mutations; use expected-source writes, locks, and atomic replacement. Reject traversal/symlinks; never overwrite occupied paths. Require Workspace Trust for Workspace mutations, generation, and preview.

Consequences:

- Prevent common stale-editor losses; expose failures; test storage without VS Code.
- External editors ignore locks; concurrent external-write race remains.
- No network, provider execution, telemetry, database, or shell execution.
