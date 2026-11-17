# GitHub Settings

Configure repository settings to match GitHub Flow.

## `main` branch ruleset

Create or update an active ruleset targeting only `refs/heads/main`:

- Require pull requests; zero required approvals is sufficient.
- Dismiss stale approvals when new commits are pushed.
- Require status check **PR validation**.
- Block force pushes and branch deletion.
- Configure no bypass actors.

## Repository settings

Enable **Automatically delete head branches** after pull request merge. Keep `main` as the only long-lived branch. Do not protect or create `develop` or `release/*` branches.

The PR workflow job ID is `pr-validation`; its required check name is **PR validation**. Update the ruleset if this name changes.

Protect release tags matching `v[0-9]*` from update and deletion while allowing new tags.
