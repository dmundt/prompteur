---
version: 1
name: Audit Implementation Completeness
description: Audit implementation against requirements, tests, and workflows for gaps.
category: review
tags: [audit, requirements, completeness, integration]
---

Audit implementation completeness in {{workspace}} against these requirements:

{{selection}}

- Trace each requirement through entry points, UI/commands, handlers, logic, storage, errors, and tests.
- Build a requirement/evidence matrix. Track implementation, automated tests, and end-to-end verification separately.
- Mark complete/partial/missing/unverified with evidence; code presence is not execution proof.
- Credit tests only when assertions prove requirements. Test presence is not passing evidence.
- Check unwired actions, placeholders, ignored inputs, stale state, premature success, and missing failure handling.
- For each gap: severity, confidence, verified file/line, impact, smallest fix, proof test/workflow.
- Separate source inspection from executed verification. Request missing context; do not invent or modify code.
- If selection is empty, use sourced acceptance criteria or request requirements.
