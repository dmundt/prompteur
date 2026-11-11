# AGENTS.md

ADR editing rules. Decisions live in ADR files.

- Start at [index.md](./index.md); sync additions, renames, supersessions, and removals.

## File conventions

- Name ADRs `NNN-kebab-case-title.md` with three-digit sequence.
- Start with `# ADR NNN: Title`, then `Status:`.
- Keep short: decision and consequences.

## Changing decisions

- Read relevant ADR before changing covered code/docs.
- Do not contradict accepted ADRs; supersede with a new ADR.
- On supersession, update old `Status:`; do not delete the ADR.
