---
version: 1
name: Release Readiness Audit
description: Find release blockers across build, tests, package, activation, workflows, and docs.
category: review
tags: [audit, release, packaging, verification]
---

Audit release readiness for {{workspace}} with this scope:

{{selection}}

- Identify artifact, source revision, and version.
- If selection is empty, inspect available context and state scope; request missing context.
- Check build, types, tests, package contents, activation, commands, critical workflows, and docs.
- Use existing checks. Do not publish, install to user profile, or modify source.
- For each finding: severity, verified file/line, confidence, impact, smallest fix, verification.
- Separate blockers from optional work. List commands/results/untested areas.
- Conclude ready/conditional/blocked. Tests alone do not prove readiness; missing evidence is not proof.
- Failed mandatory checks block release. Untested mandatory checks prevent unconditional readiness.
