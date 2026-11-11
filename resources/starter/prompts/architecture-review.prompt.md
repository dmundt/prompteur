---
version: 1
name: Architecture Review
description: Assess architecture against requirements, failure modes, and constraints.
category: review
tags: [architecture, review, scalability, tradeoffs, reliability, resilience]
---

Review this architecture in {{workspace}}:

{{selection}}

- List evidence-backed requirements and assumptions.
- Evaluate current needs first. Discuss scale/deployment only when constraints support it; avoid speculative redesign.
- Check ownership, consistency, dependency direction, deployment coupling, and failure isolation.
- Compare alternatives by cost, benefit, operations, and migration.
- State when recommendations change. Ask for missing constraints; do not assume unlimited scale/budget/availability.
- For major recommendations, give validation and a measurable revisit condition. Never invent thresholds.
- Cite verified locations; state impact, confidence, and checks.
- If selection is empty, inspect available context and state scope; request missing material.
- Review only. Do not change implementation.
