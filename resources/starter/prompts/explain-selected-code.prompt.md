---
version: 1
name: Explain Selected Code
description: >
  Explain purpose, execution flow, inputs, outputs, and important assumptions without inventing missing context.
category: explain
tags: [ explanation, code, onboarding ]
---
Explain this code from {{filename}} in {{workspace}}:

{{selection}}

Start with its purpose, then walk through the main execution path.
Describe inputs, outputs, side effects, error handling, and important
assumptions. Use a small example when it clarifies behavior.
Distinguish visible facts from inferences. Do not claim to have inspected
callers or dependencies that were not provided. Identify the specific
additional context needed to resolve uncertainties. Do not modify code.
If selection is empty, read the identified file when accessible; otherwise
request the code to explain.
