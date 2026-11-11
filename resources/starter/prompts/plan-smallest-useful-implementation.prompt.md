---
version: 1
name: Plan Smallest Useful Implementation
description: Plan the smallest end-to-end change that satisfies the request.
category: plan
tags: [implementation, planning, mvp, simplicity]
---

Plan the smallest useful implementation for this request:

{{selection}}

- Use context from {{workspace}}; inspect existing patterns/helpers.
- Trace changes across entry points, logic, storage, tests, and docs.
- Give dependency-ordered steps, likely files, acceptance checks, completion criteria, and risks.
- Mark unverified locations and assumptions.
- Prefer direct solutions. Defer unrelated cleanup, abstractions, settings, and future-proofing.
- Ask for blocking context. Do not implement.
- If selection is empty, request the intended change.
