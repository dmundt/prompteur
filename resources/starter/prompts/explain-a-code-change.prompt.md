---
version: 1
name: Explain a Code Change
description: Summarize a diff's behavioral changes and compatibility impact.
category: explain
tags: [diff, changes, behavior]
---

Explain this code change:

{{selection}}

- Summarize what changed and the evidence-backed reason; mark inferred intent.
- Contrast behavior before and after, including interfaces, errors, and side effects.
- Identify affected callers and compatibility implications.
- Separate verified test results from tests merely present in the diff.
- If no diff is available, request it. Explain only; do not edit.
