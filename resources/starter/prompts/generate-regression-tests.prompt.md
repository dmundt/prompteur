---
version: 1
name: Generate Regression Tests
description: Capture an evidenced bug with a focused regression test.
category: test
tags: [testing, regression, bugfix]
---

Add regression tests for this defect or fix:

{{selection}}

- Establish the failing input, expected behavior, and original failure mechanism.
- Add the smallest test that detects the defect through observable behavior.
- Use existing fixtures and helpers; avoid asserting incidental implementation details.
- Demonstrate failure on the unfixed behavior and success with the fix when feasible.
- Do not alter production code or weaken assertions. Report executed checks and evidence gaps.
