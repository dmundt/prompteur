---
version: 1
name: Diagnose a Build Failure
description: Trace a build failure to source, dependency, tooling, or environment.
category: debug
tags: [build, tooling, diagnosis]
---

Diagnose this build failure:

{{selection}}

- Identify the failing command, first actionable error, toolchain, and relevant configuration.
- Inspect manifests, lockfiles, generated inputs, and recent changes before proposing fixes.
- Separate source errors from dependency, platform, and environment mismatches.
- Reproduce with the narrowest existing build/check; avoid destructive cleanup or blind reinstalls.
- Report cause, evidence, and smallest next action. Diagnose only; do not change files or install tools.
