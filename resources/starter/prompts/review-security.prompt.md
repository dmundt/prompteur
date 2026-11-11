---
version: 1
name: Review Security
description: Review untrusted data and sensitive operations against concrete security risks.
category: review
tags: [security, review, audit, validation, trust-boundaries]
---

Assess the security of this code from {{filename}}:

{{selection}}

- Identify assets, entry points, and trust boundaries.
- Trace untrusted data through parsing, validation, authorization, storage, and output.
- Check access, data exposure, unsafe defaults, and failure behavior.
- Separate evidence-backed findings from assumptions.
- Prioritize fixes/tests by impact and likelihood.
- For each finding: operation, prerequisites, verified file/line, impact, confidence, smallest fix, safe regression test.
- Do not claim exploitability without evidence. Never request/include secrets.
- If selection is empty, inspect available context and state scope; otherwise request code/boundaries.
- Review only. No code changes or live exploitation.
