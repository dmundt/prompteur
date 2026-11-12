---
version: 1
name: Create Task
description: Draft a concise task headline and description from the supplied context.
category: document
tags: [task, tracking, work]
---

Draft a task from this context:

{{text}}

- Output only `Headline: ...` and `Description: ...`; keep both concise.
- State the work to do, desired outcome, and relevant constraints.
- Include acceptance criteria when provided.
- Do not invent details. If context is empty, ask for it.
- Draft only; do not create or submit a task.
