---
version: 1
name: Create Issue
description: Draft a concise issue headline and description from the supplied context.
category: document
tags: [issue, tracking, report]
---

Draft an issue from this context:

{{text}}

- Output only `Headline: ...` and `Description: ...`; keep both concise.
- Describe the problem or desired outcome and relevant context.
- Include expected and actual behavior when provided.
- Do not invent details. If context is empty, ask for it.
- Draft only; do not create or submit an issue.
