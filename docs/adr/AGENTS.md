# AGENTS.md

Guidance for working with the ADRs in this folder. The decisions themselves live in the ADR files, not here.

Start from [index.md](./index.md) to find the right ADR. Keep `index.md` in sync with any ADR you add, rename, supersede, or remove.

## File conventions

- Name ADRs `NNN-kebab-case-title.md` with a zero-padded three-digit sequence number.
- Start each ADR with a `# ADR NNN: Title` heading, followed by a `Status:` line.
- Keep each ADR short: a decision section followed by a `Consequences:` paragraph.

## Changing decisions

- Read the relevant ADR before changing code or docs it covers.
- Do not contradict an accepted ADR. Write a new ADR that supersedes it instead.
- When superseding, update the old ADR's `Status:` to reflect the replacement rather than deleting it.
