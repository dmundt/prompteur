# Changelog

## Unreleased

## 1.1.0

- Show saved prompt context variables in the prompt hover.
- Report how many existing starter files match or differ from bundled versions; keep existing files and unsaved edits.
- Remove User and Workspace scope icons to reduce tree-view visual noise.
- Copy Text no longer interrupts for missing filename/workspace context; reports missing context after copying. Empty clipboard input still requires confirmation. Review Code starter no longer requires filename/workspace variables; existing saved prompts remain unchanged.
- Add a read-only Copilot prompt search/render tool.
- Prefer exact prompt names in Copilot; keep duplicates explicit and retrieve chosen candidates by scope/path without substituting missing prompts.
- Add shared exact/full-text/fuzzy matching, case sensitivity, and relevance/name ordering settings for tree filtering and Copilot. Default tree filtering now prefers exact names and relevance ordering. Copilot defaults to returning a unique highest-relevance match; duplicate exact names and highest-score ties require a choice. Set Search: Selection to Require Choice for conservative multiple-match handling. Prompt format is unchanged.
- Rename actions to **Copy Text** and **New**. Enable **Paste Prompt** only after copying a prompt. Hide **Duplicate**, retaining command compatibility.

## 1.0.0

- Promote the 0.5.0 beta to the first stable release; prompt format remains version 1.
