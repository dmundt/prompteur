---
version: 1
name: Generate Focused Unit Tests
description: Add focused tests for observable behavior, boundaries, and failures.
category: test
tags: [testing, unit-tests, regression, boundaries]
---

Add focused unit tests for this code from {{filename}}:

{{selection}}

- Follow nearby framework, helper, naming, and mock patterns. Ask for examples if absent; do not invent APIs/install tools.
- Cover normal behavior, meaningful boundaries, and explicit failures.
- Assert observable results. Keep tests deterministic and independent.
- Do not change production behavior, weaken assertions, or disable checks to pass tests.
- For known bugs, show regression failure before/fix pass when feasible; state if unverified.
- Run the smallest relevant test; report command, result, and unverified cases.
- If selection is empty, inspect the named file or ask for code and expected behavior.
