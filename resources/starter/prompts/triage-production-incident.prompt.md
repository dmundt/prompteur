---
version: 1
name: Triage Production Incident
description: Triage incident impact and reversible stabilization options against evidence.
category: debug
tags: [incident, production, observability, monitoring, troubleshooting, runbook]
---

Help triage this production incident in {{workspace}}:

{{selection}}

- Summarize impact, timeline, recent changes, and evidence gaps.
- Separate observations from hypotheses.
- Propose reversible mitigations with prerequisites, risks, rollback conditions, and success signals.
- Preserve evidence. Avoid destructive changes/speculative commands.
- Outline parallel investigations and stakeholder update.
- Separate recovery from root-cause confirmation.
- State escalation/stop conditions: worsening impact, uncertain rollback, missing authorization.
- If selection is empty, request symptoms and impact.
- Advise only; do not change production.
