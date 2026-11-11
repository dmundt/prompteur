---
version: 1
name: Plan Behavior-Preserving Refactor
description: Plan a small refactor with verified behavior invariants and regression tests.
category: plan
tags: [refactoring, behavior, maintainability, planning]
---

Plan a behavior-preserving refactor of this code from {{filename}}:

{{selection}}

- State the concrete maintenance problem.
- List invariants: public interfaces, errors, side effects, ordering, persistence.
- Verify runtime/input assumptions: coercion, equality, platform edges. Preserve explicit comparisons unless equivalence is proven.
- Remove/merge concepts before adding abstractions.
- Give ordered steps, evidenced callers, and equivalence tests.
- Flag missing context and intentional behavior changes for approval.
- Do not implement or bundle cleanup.
- If selection is empty, inspect the named file or request code/problem.
