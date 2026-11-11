# ADR 001: Individual YAML Files Are Authoritative

Status: Superseded by ADR 004.

## Decision

Historical: store one YAML document per prompt; use path identity, six fields, nested discovery, category browsing. No settings/order/usage sidecars. Preserve comments on duplicate; never reformat ordinary saves.

## Consequences

- Local edits and copies; per-file validation.
- No import/export or bundles.
- Reject unknown fields/versions; no automatic migration.
