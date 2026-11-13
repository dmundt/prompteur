# Prompteur

[![Local Extension Quality](https://github.com/dmundt/prompteur/actions/workflows/quality.yml/badge.svg)](https://github.com/dmundt/prompteur/actions/workflows/quality.yml)

- Local, Git-friendly Markdown prompts for developers who reuse prompts across projects.
- Category/tag organization and full-text search.
- Copy or preview generated text with selection, clipboard, filename, workspace, and entered text variables.
- User library in profile storage; Workspace library in `.vscode/prompts`.
- No Prompteur account, direct model calls, or telemetry. Optional Copilot tool returns requested prompt text and used variables to the configured model after VS Code confirmation. User prompts sync through VS Code Settings Sync by default. Workspace writes, generation, and preview require Trust.
- Stable release. Prompt file format version: 1.

## Install and Run

- Desktop VS Code 1.96+.
- Development: Node.js 22.12+.

```sh
npm ci
npm run build
npm run package
code --install-extension prompteur-1.2.0.vsix
```

- Press F5 to open Extension Development Host.
- Packaging creates local VSIX; it does not publish. Publishing a GitHub release triggers Marketplace publication after CI passes.

## Daily Workflow

1. Open **Prompteur** > **New**; choose User or Workspace.
2. Edit/save Markdown in VS Code's text editor.
3. Browse categories or **Filter Prompts**; combine text and exact tags (for example, `tag:security review`).
4. Select source text, then run **Copy Text** from a prompt row or the Command Palette.
5. Paste generated text into Chat. Direct insertion into the Chat composer is not available.

- Generation reads selection from the current or last active non-library, non-preview editor in the same window.
- Selecting a placeholder in a prompt body does not provide context.
- VS Code windows do not share selections; copy in the source window, then paste in the target window.
- **Copy Text** copies the rendered prompt for Chat or another editor.
- Prompt hover uses a bold title, normal-weight labels, and theme-muted text values in compact rows. Horizontal separators follow the description when present and precede the file path. Category, tag, and path links keep native link colors. A file icon marks the path; a warning icon marks invalid placeholders. Context values are not read.
- Hover over categories for their purpose, or User and Workspace for library storage, sync, and Trust guidance. Click the scope's folder location to reveal it in the system file manager.
- The toolbar filter icon indicates an active filter; `Filter: <query>` above the tree shows its text. Select the icon to edit the query, reusing an open filter input; use **Clear Filter** to remove it. Closing the input retains the filter for the current window session; filters are not persisted.
- The **Prompteur** view opens with an expanded **Prompts** root containing User and available Workspace libraries. **Category Count Mode** controls root, library, and category counts: `filtered` shows matching valid prompts, `total` shows all valid prompts, and `hidden` removes counts. The root sums library counts. Counts update with filters, search settings, and library changes; zero counts show **(0)**. Invalid prompts are excluded. Search still controls visible categories and prompts, including in `total` mode and flat view. No Activity Bar count badge is shown.

- Prompt menu: **Copy Text**, separator, **Copy Prompt**, Preview, Edit, Delete.
- **Copy Prompt** stores a window-local prompt record; **Paste Prompt** creates a file on User/Workspace scope or category. Paste is enabled after copying; category target overrides category; source remains.
- **Copy Text** generates text to the OS clipboard. Workspace source/destination requires Trust.
- Commands: Command Palette > **Prompteur**. **Clear Filter** resets search; **Reload Libraries** rescans.

- View gear opens settings:
  - **Default Scope**: User, Workspace, or Ask for untargeted New/Add Starter Library/Paste Prompt. Ask shows the picker when both libraries exist; otherwise it selects User. Explicit tree targets win.
  - **Preferred Category**: preselect approved category; user confirmation remains required.
  - **Show Tags**: show/hide row labels; default On. Search and tooltips remain unchanged.
  - **Category Count Mode**: Filtered (default), Total, or Hidden. Search still controls which categories appear.
  - **Group by Category**: On by default; turn off for a flat prompt list.
  - **Sync User Prompts**: On by default; uses VS Code Settings Sync between instances. Incoming changes apply on activation or **Reload Libraries**. Workspace prompts do not sync.
  - **Search: Matching**: `fullText` (default) prefers exact names, then full text; `exact` matches whole names only; `fuzzy` also tries typo-tolerant names when neither earlier phase matches.
  - **Search: Case Sensitive**: Off by default; applies to names/free text. Tag/category filters remain exact and case-insensitive.
  - **Search: Ranking**: `relevance` (default) or `name`. Relevance prefers exact names, name prefixes, name substrings, metadata, then body text; multiword queries use their weakest matching field.
  - **Search: Selection**: `bestMatch` (default) lets Copilot return the unique highest-relevance prompt after tool approval, even with lower-ranked matches present. `requireChoice` returns candidates whenever multiple prompts match. Duplicate exact names and highest-score ties always require a choice. Tree filtering never automatically opens or runs prompts.

- Built-in virtual categories: Explain, Plan, Implement, Review, Test, Debug, Document.
- Add profile-wide categories only after confirmation. Remove unused categories with **Remove Prompt Category**; reassign prompts first.
- Use **Add Prompt Category** in the Command Palette to approve a category without creating a prompt. A prompt with an unapproved category remains a warning row: right-click > **Approve Prompt Category**, then confirm. Typing a category into YAML does not approve it automatically; approval does not rewrite the prompt.
- New custom categories ask for optional short descriptions (240 characters maximum). Right-click a custom category > **Edit Category Description**, or use that command in the Command Palette, to edit later. Blank restores generic hover help; Escape cancels. Descriptions apply to both libraries and sync with approved categories when **Sync User Prompts** is enabled. Built-in descriptions are read-only.
- Custom category rows have a muted `custom` label. Right-click > **Rename Category...**, or use the Command Palette, to rename across both libraries after confirmation. Description, filenames, comments, and prompt bodies are preserved. Save/discard affected unsaved edits first; workspace changes require Trust. Repair invalid prompts before renaming. Update **Preferred Category** and active category filters separately if they reference the old name.
- Tags cross categories; **Show Tags** controls row labels. Tooltip links filter exact tags/categories or open the Markdown file.
- Filters use AND semantics; quote values with spaces (for example, `tag:"security review"`).
- Search covers names, descriptions, categories, tags, content, and paths. Matching/case/ranking settings apply to both tree filtering and Copilot. Existing exact-name queries now hide broader tree matches; default ordering is relevance, not alphabetical. Empty/filter-only queries retain alphabetical browsing.
- Fuzzy fallback compares the whole free-text query to prompt names: no fuzzy matching below 4 characters; 1 edit for 4–7, 2 for 8+. Insertions, deletions, and replacements count as edits; adjacent transposition counts as two. Filters still apply. Fuzzy results rank by fewer edits.
- Settings apply without reloading. Prompt files remain unchanged; no migration required.

## Use Prompts with Chat

### Copilot Tool: No Copy/Paste

1. Enable Prompteur and Copilot Chat in the same VS Code window. Use a VS Code version that supports extension Language Model Tools.
2. Save a prompt or install **Add Starter Library**. Select source code if the prompt uses `{{selection}}`.
3. Open Copilot Chat in **Agent** mode. Enable **Find Prompteur Prompt** in the tool picker if needed.
4. Reference the tool and state the task:

   ```text
   Use #prompteurPrompt to find "Review Code", then follow that prompt to review my changes. Do not edit files.
   ```

5. Approve sharing when VS Code requests confirmation. VS Code may offer **Always Allow**.

- Exact prompt names take priority according to configured case sensitivity; surrounding whitespace is ignored. Optional fuzzy fallback applies only after full-text finds nothing.
- One match, or a unique highest-relevance match with `bestMatch`: returns the rendered prompt and missing-context details to Copilot. This may share requested context without a separate candidate-choice round.
- Repeated exact names, highest-score ties, or multiple matches with `requireChoice`: returns names, User/Workspace scope, category, and path without prompt content. Choose a candidate; Copilot can retrieve its exact scope/path without another search.
- Alphabetical result ordering never decides auto-selection. Set `prompteur.search.selection` to `requireChoice` to retain conservative multiple-match handling.
- Example follow-up: `Use the Workspace candidate at prompts/review-code.prompt.md.` Copilot supplies `scope: "workspace"` and that `path`, omitting `query`.
- No match: reports not found.
- Missing candidate path: reports not found; never substitutes another prompt. Refresh the search if a prompt was renamed or removed.
- Tool output becomes model context, not text inserted into the Chat composer. Following the prompt depends on the model and your request.
- The tool is read-only; it cannot create, edit, or delete prompts. Workspace prompt results require Trust.
- Prompt text and requested selection, clipboard, filename, workspace, or entered text variables are shared with the configured model. Context comes from the same VS Code window.
- Prompteur makes no direct model/provider calls. Copilot performs the requested task.

### Manual Handoff: Any Chat

1. Select source code if the prompt uses `{{selection}}`.
2. Run **Copy Text** from the prompt row, context menu, or Command Palette.
3. Paste into Copilot Chat, an Agents window, or another chat client; submit.

- No Copilot tool support required. **Copy Text** renders variables before copying.
- Direct Chat composer insertion is unavailable. For another window, copy in the source window and paste in the target.
- **Copy Prompt** / **Paste Prompt** copy library records; use **Copy Text** for chat handoff.

## Prompt Files

```markdown
---
version: 1
name: Inspect Change
description: Look for defects in the selected code.
category: review
tags: [inspection, security]
---

Inspect {{filename}} in {{workspace}}.

{{selection}}
```

- Frontmatter fields: `version`, `name`, `description`, `category`, `tags`. Markdown body is prompt content.
- Required: `version: 1`, nonempty `name`, approved `category`. Description/tags default empty.
- Reject unknown fields, unsupported versions, malformed YAML, and aliases.
- File path is identity; names may repeat. Filenames use readable slugs and numeric collision suffixes.

- Variables: `selection`, `clipboard`, `filename`, `workspace`, `text`.
- `{{text}}` opens a native single-line input. Press Enter to submit; Escape cancels generation. Blank input is rejected; input is limited to 1 MiB and reused for repeated placeholders. Only one input may be pending per window.
- Text entry is requested only after choosing a prompt, including through Copilot. No selection/clipboard fallback. Prompteur does not save entered text or keep input history.
- `{{text}}` requires Prompteur 1.2.0 or later; older versions reject it. Prompt format remains version 1. Existing installed prompts are not rewritten.
- Expand once; collapse repeated blank lines. Empty selection is allowed. Missing filename/workspace context does not block copying; one notification lists missing values. Empty clipboard input requires confirmation. Preview lists missing context.
- Unknown/malformed placeholders block generation. Read clipboard only when requested.

- **Preview** opens an editable plaintext snapshot; it does not update. Reopen to regenerate. Never render images/HTML.

## Libraries

- Workspace root: `.vscode/prompts/prompts/` in the first local workspace.
- User root: `prompts/prompts/` in this extension's profile storage, typically `<user-data>/User/globalStorage/dmundt.prompteur/prompts/prompts/`.
- Command Palette > **Prompteur: Reveal User Library Folder** reveals the library root in the system file manager; prompt files are in its `prompts/` subfolder. Create a prompt or add starters first if the library folder does not exist yet.

```text
.vscode/prompts/
  prompts/
    review-code.prompt.md
    engineering/
      incident.prompt.md
```

- Discover nested `.prompt.md` files; browse by category. Ignore legacy `.yaml`/`.yml` files without changing them.
- No remote/virtual libraries.
- Approved categories are profile-wide across User/Workspace.
- Workspace writes/generation/preview require Trust; User prompts work in untrusted workspaces.

- No library-settings file or usage records. Preserve existing `settings.yaml`, rules, Favorites/MRU, and other files.
- Do not load/convert YAML prompts; create `.prompt.md` files.
- Unapproved categories appear as repairable items. Move prompts from old custom directories into `prompts/` manually.

## Starters

**Add Starter Library** copies 37 editable prompts, at least five per category:

- **Explain:** Explain Selected Code; Explain Execution Flow; Explain an API Contract; Explain a Configuration; Explain a Code Change.
- **Plan:** Clarify Requirements; Plan Smallest Useful Implementation; Plan Behavior-Preserving Refactor; Plan a Data Migration; Plan a Dependency Upgrade.
- **Implement:** Implement Scoped Change; Fix a Reproduced Bug; Implement an API Endpoint; Implement Input Validation; Implement Error Handling.
- **Review:** Review Code; Review Complexity; Review Architecture; Review Security; Audit Release Readiness; Audit Implementation Completeness; Audit Accessibility.
- **Test:** Generate Focused Unit Tests; Generate Integration Tests; Generate Regression Tests; Generate Boundary Tests; Plan End-to-End Tests.
- **Debug:** Triage Production Incident; Analyze Root Cause; Diagnose a Failing Test; Investigate a Performance Problem; Diagnose a Build Failure.
- **Document:** Document Feature Usage; Create Issue; Create Task; Document an API Contract; Write a Troubleshooting Guide.

- Request-based starters use entered `text`; code, diff, configuration, and diagnostic starters use `selection`. Hover a prompt to inspect its context variables.
- Installation is opt-in. Rerun after updates to add missing starters.
- Never replace existing files, including invalid ones. Writes are safe per-file, not transactional; failures report completed count.
- Completion reports added files and saved files that match or differ from the bundled versions. Differences can be edits or older versions. Unsaved editors without saved files are skipped; comparisons use saved contents.
- To use `{{text}}` in older installed copies of Clarify Requirements, Plan Smallest Useful Implementation, or Implement Scoped Change, edit the prompt and replace `{{selection}}` with `{{text}}`. Preserve any custom edits. Keep `{{selection}}` if you prefer the original behavior.

- No import/export or bundles. In-app copies use a temporary window-local buffer; use the filesystem across windows/apps.

## Validation and Safe Writes

- Invalid frontmatter appears as a repairable item and editor diagnostic; unrelated files remain usable.
- Ordinary saves preserve formatting/body. No format-on-save hook.
- Writes use expected-source checks, exclusive locks, synced temp files, atomic replacement, and no-overwrite creation.
- Reject symlink/junction paths. Bound file, library, YAML depth/node, and generated output.
- External writers ignore extension locks; no filesystem sandbox or distributed transaction.

- Docs: [storage](docs/storage.md), [architecture](docs/architecture.md), [commands](docs/api.md), [scope](docs/mvp-scope.md), [verification](docs/verification.md), [icons](docs/icons.md).
- Historical audit/remediation records and older changelog entries describe prior designs.
