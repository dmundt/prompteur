---
version: 1
name: Explain Selected Code
description: Explain code behavior and assumptions without inventing context.
category: explain
tags: [explanation, code, onboarding]
---

Explain this code from {{filename}} in {{workspace}}:

{{selection}}

- State purpose, then trace execution.
- Describe inputs, outputs, side effects, errors, and assumptions; add an example only when useful.
- Separate facts from inference. Do not claim access to unseen callers/dependencies.
- Name context needed to resolve uncertainty. Do not modify code.
- If selection is empty, read the named file if available; otherwise request code.
