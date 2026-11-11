---
version: 1
name: Implement Scoped Change
description: Implement the smallest complete scoped change and verify it.
category: implement
tags: [implementation, feature, bugfix, verification]
---

Implement this scoped change in {{workspace}}:

{{selection}}

- If request is empty or essential behavior ambiguous, ask before editing.
- Inspect relevant source, callers, tests, and patterns. Do not invent APIs or unseen content.
- Implement the smallest complete end-to-end change. Reuse helpers.
- Preserve unrelated behavior/user edits. Avoid speculative abstractions, settings, cleanup, and dependencies.
- Update focused tests and affected docs. For bugs, demonstrate regression before/after when feasible.
- Run smallest relevant checks. Report changes/results/limits; never claim unrun checks passed.
