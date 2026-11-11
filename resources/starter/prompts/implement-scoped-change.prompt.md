---
version: 1
name: Implement Scoped Change
description: >
  Implement the smallest complete change using existing patterns, preserving unrelated behavior and verifying the result.
category: implement
tags: [ implementation, feature, bugfix, verification ]
---
Implement this scoped change in {{workspace}}:

{{selection}}

If the request is empty or essential behavior is ambiguous, ask for the
missing requirements before editing. Inspect relevant source, callers,
tests, and existing patterns; do not invent APIs or unseen file contents.
Implement the smallest complete end-to-end solution across relevant entry
points, logic, storage, and error handling. Reuse existing helpers.
Preserve unrelated behavior and user edits. Avoid speculative abstractions,
new settings, unrelated cleanup, and dependency changes unless necessary.
Update focused tests and directly affected documentation. For a bug fix,
demonstrate the regression before and after the fix when feasible.
Run the smallest relevant existing checks. Report changes, commands and
results, and remaining limitations; never claim unexecuted checks passed.
