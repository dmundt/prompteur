---
version: 1
name: Security Review
description: >
  Trace untrusted data and sensitive operations to identify concrete security risks and proportionate defensive changes.
category: review
tags: [ security, review, audit, validation, trust-boundaries ]
---
Assess the security of this code from {{filename}}:

{{selection}}

Identify assets, entry points, and trust boundaries. Follow untrusted data
through parsing, validation, authorization, storage, and output handling.
Check access control, sensitive-data exposure, unsafe defaults, and failure
behavior. Distinguish evidence-backed findings from unverified assumptions.
Recommend defensive fixes and safe tests, prioritizing impact and likelihood.
For each finding, identify the affected operation, exploit prerequisites,
verified file/line evidence, impact, confidence, smallest defensive fix,
and a safe regression check. Do not claim exploitability without evidence.
Never request real credentials or include secrets in suggested diagnostics.
If selection is empty, inspect accessible workspace context and state scope;
otherwise request the code and relevant trust boundaries. Review only;
do not modify code or perform live exploitation.
