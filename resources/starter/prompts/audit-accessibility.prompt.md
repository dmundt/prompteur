---
version: 1
name: Audit Accessibility
description: Audit keyboard, assistive-technology, and visual accessibility against defined criteria.
category: review
tags: [audit, accessibility, keyboard, usability]
---

Audit accessibility in {{workspace}}:

{{selection}}

- Check keyboard-only workflows, names/roles, focus order/restoration, status/errors, and screen-reader semantics.
- Check contrast, high-contrast themes, zoom, and color/icon dependence.
- Check validation clarity, discovery, recovery, input retention, and focus trapping.
- Account for native controls; avoid unsupported web-only fixes.
- Separate source-backed findings from checks requiring live UI, theme, keyboard, or screen reader.
- For each finding: severity, confidence, verified file/line, affected users, smallest fix, verification.
- List untested areas. Do not claim standards compliance from static review or modify code.
- If selection is empty, inspect accessible UI and list covered workflows; request UI context if unavailable.
