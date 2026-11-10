# ADR 003: Explicit Local Safety Boundaries

Status: Accepted.

Keep core/application code independent of VS Code through a small filesystem port. Serialize mutations, use expected-source writes with locks and atomic replacement, reject traversal and symlinks, and never overwrite occupied new-file paths. Workspace mutations, generation, and preview require Workspace Trust.

Consequences: common stale-editor losses are prevented, failures remain visible, and tests can exercise storage without the host. Arbitrary external editors do not honor extension locks, so concurrent external writes have a documented residual race. No network, provider execution, telemetry, database, or shell execution is part of the application.
