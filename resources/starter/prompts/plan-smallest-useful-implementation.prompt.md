---
version: 1
name: Plan Smallest Useful Implementation
description: >
  Plan the simplest end-to-end change that satisfies the request using existing repository patterns.
category: plan
tags: [ implementation, planning, mvp, simplicity ]
---
Plan the smallest useful implementation for this request:

{{selection}}

Use the available context from {{workspace}}. Identify existing patterns
and helpers before proposing new code. Trace required changes across user
entry points, application logic, storage, tests, and documentation.
Give a short dependency-ordered plan with likely files, acceptance checks,
observable completion criteria for each step, and relevant risks.
Mark unverified file locations and assumptions.
Prefer direct solutions; defer unrelated cleanup, abstractions, settings,
and future-proofing. Ask for missing context that blocks a sound plan.
Do not implement the plan.
If selection is empty, request the intended change before planning.
