---
version: 1
name: Code Review
description: Find evidence-backed defects and risks in a source change.
category: review
tags: [review, quality, maintainability, security]
---

Inspect this change from {{filename}} in {{workspace}}:

{{selection}}

- Find actionable defects introduced by this change; separate pre-existing issues.
- Exclude style preferences and unrelated cleanup.
- Check boundaries, errors, security assumptions, and hot-path costs.
- For each finding: severity, confidence, verified file/line, impact, fix, regression test.
- Separate confirmed defects from questions. Do not invent locations.
- Finish with highest-value missing tests.
- If selection is empty, inspect an available diff or request the change.
- Review only; do not modify code.
