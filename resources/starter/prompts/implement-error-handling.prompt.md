---
version: 1
name: Implement Error Handling
description: Implement explicit failure handling without masking errors.
category: implement
tags: [errors, recovery, reliability]
---

Implement error handling for this failure scenario:

{{text}}

- Trace failure sources, ownership, callers, and existing reporting/recovery patterns.
- Distinguish expected failures, cancellation, and unexpected faults.
- Preserve useful error context without exposing sensitive data.
- Avoid broad catches, success-shaped fallbacks, duplicate reports, or unsafe retries.
- Add focused failure/recovery tests and run them. Preserve unrelated success behavior.
