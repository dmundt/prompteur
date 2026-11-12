---
version: 1
name: Generate Boundary Tests
description: Test specified limits, empty values, and edge conditions.
category: test
tags: [testing, limits, edge-cases]
---

Add boundary tests for this code or contract:

{{selection}}

- Identify documented limits, invariants, optional values, and invalid input classes.
- Test meaningful values below, at, and above each specified limit.
- Cover relevant empty, missing, malformed, and combined conditions without exhaustive duplication.
- Derive expectations from the contract; ask about ambiguous behavior instead of inventing it.
- Use existing tooling, preserve production code, and report focused test results.
