---
version: 1
name: Investigate a Performance Problem
description: Locate a measured performance bottleneck and propose a targeted fix.
category: debug
tags: [performance, profiling, latency]
---

Investigate this performance problem:

{{selection}}

- Establish workload, environment, measured baseline, and expected target; do not invent thresholds.
- Reproduce with existing benchmarks or profiling tools.
- Trace expensive operations, repeated work, contention, and allocation with runtime evidence.
- Separate bottlenecks from speculation; propose the smallest change and a before/after check.
- Investigate only; do not edit code, add dependencies, or run load against production.
