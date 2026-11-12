---
version: 1
name: Review Code
description: Review source change against defect and risk evidence.
category: review
tags: [review, quality, maintainability, security]
---

Review the selected code or available diff:

{{selection}}

- Find actionable defects introduced by this change; separate pre-existing issues.
- Exclude style preferences and unrelated cleanup.
- Check boundaries, errors, security assumptions, and hot-path costs.
- For each finding: severity, confidence, verified file/line, impact, fix, regression test.
- Separate confirmed defects from questions. Do not invent locations.
- Finish with highest-value missing tests.
- If selection is empty, inspect an available diff or request the change.
- Review only; do not modify code.
