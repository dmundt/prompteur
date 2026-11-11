---
version: 1
name: Accessibility Audit
description: >
  Assess keyboard access, accessible names, focus, assistive-technology behavior, and visual accessibility.
category: review
tags: [ audit, accessibility, keyboard, usability ]
---
Audit accessibility of this interface in {{workspace}}:

{{selection}}

Check keyboard-only completion of core workflows, accessible names and
roles, focus order and restoration, status/error announcements, and
screen-reader semantics. Review contrast, high-contrast themes, zoom,
and reliance on color or icons alone where applicable.
Check whether validation errors are understandable, discoverable, and
recoverable without losing input or trapping keyboard focus.
Account for native platform controls rather than assuming web-specific
fixes apply everywhere. Separate source-backed findings from checks
requiring an actual UI, theme, keyboard, or screen reader.
For each finding, give severity, confidence, verified file/line references, affected
users, smallest fix, and concrete verification steps. List untested areas.
Do not claim standards compliance from static inspection or modify code.
If selection is empty, inspect accessible UI implementation and state
which workflows were covered; request UI context if none is available.
