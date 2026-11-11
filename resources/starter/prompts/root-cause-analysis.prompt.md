---
version: 1
name: Analyze Root Cause
description: Analyze a failure's root cause using falsifiable, evidence-based hypotheses.
category: debug
tags: [debugging, incident, production, root-cause-analysis, observability]
---

Investigate the failure described here:

{{selection}}

- Separate observed symptom from expected behavior.
- Build evidence timeline. Rank causes; give one cheap disproof check per hypothesis.
- Reproduce with debugger/tests/runtime evidence before confirming cause.
- Do not replace observation with inference or expose secrets.
- Trace cause to earliest incorrect input/decision/state.
- Recommend focused fix and regression test. State uncertainty and practical verification.
- If details are missing, request expected/observed behavior and reproduction evidence.
- Investigate only; do not fix without approval.
