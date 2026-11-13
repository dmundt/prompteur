# Changelog

## Unreleased

- Show prompt scope and metadata in a compact hover with a bold title, normal-weight labels, theme-muted text values, and file/invalid-context warning icons.

## 1.2.0

- Expand Prompts and available User/Workspace scopes when the Prompteur view becomes visible.
- Show local prompts and counts without waiting for startup User prompt synchronization; refresh after reconciliation.
- Add an expanded Prompts root and parenthesized root/per-library counts that follow the active filter, without an Activity Bar count badge. Rename the view to Prompteur.
- Show the active filter above the prompt tree and reuse the open filter input.
- Show an actionable tree row when the active prompt filter has no matches; hover for the clear-filter instruction.
- Add custom category rename across both libraries and muted `custom` row labels.
- Add direct category creation and an explicit approval action for prompts with unapproved categories; preserve prompt files.
- Add optional custom category descriptions with native creation input and context-menu/Command Palette editing; sync them with approved categories.
- Add category and library hover help to the prompt tree, with clickable User and Workspace folder locations.

- Improve prompt tree responsiveness for large libraries when opening categories or using flat view.
- Speed up User library synchronization for larger prompt collections.
- Add 21 starters, including Create Issue and Create Task for concise headlines and descriptions, bringing the library to 37 prompts with at least five per category. Rerun Add Starter Library to add missing files without replacing installed prompts.
- Add Reveal User Library Folder to open its location in the system file manager.
- Add `{{text}}` for explicit single-line input through a native input box. Five existing request-based starters now use it; installed prompts stay unchanged. New placeholder requires 1.2.0 or later; prompt format remains version 1.
- Show an active filter icon in the prompt view toolbar.

## 1.1.0

- Simplify the Activity Bar tent icon.
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
