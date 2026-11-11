---
version: 1
name: Code Review
description: >
  Inspect a source change for defects, maintainability risks, performance issues, and security weaknesses. Prioritize findings supported by evidence.
category: review
tags: [ review, quality, maintainability, security ]
---
Inspect this change from {{filename}} in {{workspace}}:

{{selection}}

Focus on actionable defects introduced by this change; distinguish any
pre-existing issues. Exclude style preferences and unrelated cleanup.
Identify observable defects before preferences. Check boundary conditions,
error handling, security assumptions, and the cost of the main execution paths.
For each finding, give severity, confidence, verified file/line evidence,
user impact, a focused correction, and a regression check.
Separate confirmed defects from questions that require more context.
Finish with the most valuable missing tests. Do not invent file locations.
If selection is empty, inspect an available change diff; otherwise request
the change to review. Review only; do not modify code.
