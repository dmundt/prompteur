---
version: 1
name: Generate Integration Tests
description: Test collaboration across real application boundaries.
category: test
tags: [testing, integration, boundaries]
---

Add integration tests for this workflow:

{{selection}}

- Identify collaborating components and meaningful integration boundaries.
- Reuse the existing test runner, fixtures, and isolated test infrastructure.
- Exercise real interactions where practical; mock only unavailable external boundaries.
- Assert observable success, failure propagation, and relevant persistence effects.
- Keep cleanup deterministic. Do not access production systems or change runtime behavior.
- Run focused tests; report results and unverified boundaries.
