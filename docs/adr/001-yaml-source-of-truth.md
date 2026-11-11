# ADR 001: Individual YAML Files Are Authoritative

Status: Superseded by ADR 004.

The first release must remain usable without an extension or proprietary store. Store each prompt in its own YAML document, with path-based identity and six supported fields. Discover nested directories but browse by category. No library settings, ordering sidecar, or usage store is needed. Retain source comments when duplicating; do not reformat ordinary user saves.

Consequences: source-control diffs remain localized; manual editing is supported; validation errors are per-file. Files can be copied directly; no import/export interface or bundle format is needed. Unsupported schema versions and unknown fields are rejected without automatic migration.
