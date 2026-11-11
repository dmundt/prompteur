---
version: 1
name: Complexity Review
description: Find accidental complexity and propose small, behavior-preserving reductions.
category: review
tags: [review, complexity, refactoring, static-analysis, technical-debt, clean-code]
---

Review the complexity of this code from {{filename}}:

{{selection}}

- Find nested decisions, hidden state transitions, duplicated policy, and obscuring abstractions.
- Separate domain complexity from accidental complexity.
- Test features/configuration/metadata/persistence/extensibility against current requirements.
- For each concept: keep, simplify, remove, or defer; cite evidence, confidence, impact, and maintenance cost.
- Give each concept its own disposition and smallest next action.
- Recommend the smallest behavior-preserving refactor; list regression tests and tradeoffs.
- Do not add frameworks to reduce line count.
- If selection is empty, inspect available context and state scope; request missing context.
- Review only; do not edit.
