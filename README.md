# Prompteur

[![Local Extension Quality](https://github.com/dmundt/prompteur/actions/workflows/quality.yml/badge.svg)](https://github.com/dmundt/prompteur/actions/workflows/quality.yml)

- Local, Git-friendly Markdown prompts for developers who reuse prompts across projects.
- Category/tag organization and full-text search.
- Copy or preview generated text with selection, clipboard, filename, and workspace variables.
- User library in profile storage; Workspace library in `.vscode/prompts`.
- No Prompteur account, direct network service, AI provider, or telemetry. User prompts sync through VS Code Settings Sync by default. Workspace writes, generation, and preview require Trust.
- Stable release. Prompt file format version: 1.

## Install and Run

- Desktop VS Code 1.96+.
- Development: Node.js 22.12+.

```sh
npm ci
npm run build
npm run package
code --install-extension prompteur-1.0.0.vsix
```

- Press F5 to open Extension Development Host.
- Packaging creates local VSIX; it does not publish. Publishing a GitHub release triggers Marketplace publication after CI passes.

## Daily Workflow

1. Open **Prompteur** > **New Prompt**; choose User or Workspace.
2. Edit/save Markdown in VS Code's text editor.
3. Browse categories or **Filter Prompts**; combine text and exact tags (for example, `tag:security review`).
4. Select source text, then run **Copy** from the tree or Command Palette.
5. Paste generated text into Chat or another app/window. Copy never edits source or inserts into Chat.

- Generation reads selection from the current or last active non-library, non-preview editor in the same window.
- Selecting a placeholder in a prompt body does not provide context.
- VS Code windows do not share selections; copy in the source window, then paste in the target window.

- Prompt menu: Edit, Duplicate, Delete, **Copy Prompt**, Preview.
- **Copy Prompt** stores a window-local record; **Paste Prompt** creates a file on User/Workspace scope or category. Category target overrides category; source remains.
- **Copy** generates text to the OS clipboard. Workspace source/destination requires Trust.
- Commands: Command Palette > **Prompteur**. **Clear Filter** resets search; **Reload Libraries** rescans.

- View gear opens settings:
  - **Default Scope**: User, Workspace, or Ask for untargeted New Prompt/Add Starter Library/Paste Prompt. Ask shows the picker when both libraries exist; otherwise it selects User. Explicit tree targets win.
  - **Preferred Category**: preselect approved category; user confirmation remains required.
  - **Show Tags**: show/hide row labels; default On. Search and tooltips remain unchanged.
  - **Category Count Mode**: Filtered (default), Total, or Hidden. Search still controls which categories appear.
  - **Group by Category**: On by default; turn off for a flat prompt list.
  - **Sync User Prompts**: On by default; uses VS Code Settings Sync between instances. Incoming changes apply on activation or **Reload Libraries**. Workspace prompts do not sync.

- Built-in virtual categories: Explain, Plan, Implement, Review, Test, Debug, Document.
- Add profile-wide categories only after confirmation. Remove unused categories with **Remove Prompt Category**; reassign prompts first.
- Tags cross categories; **Show Tags** controls row labels. Tooltip links filter exact tags/categories or open the Markdown file.
- Filters use AND semantics; quote values with spaces (for example, `tag:"security review"`).
- Search covers names, descriptions, tags, content, and paths. Results sort alphabetically.

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

- Variables: `selection`, `clipboard`, `filename`, `workspace`.
- Expand once; collapse repeated blank lines. Empty selection is allowed; other empty values warn.
- Unknown/malformed placeholders block generation. Read clipboard only when requested.

- **Preview** opens an editable plaintext snapshot; it does not update. Reopen to regenerate. Never render images/HTML.

## Libraries

- Workspace root: `.vscode/prompts/prompts/` in the first local workspace.
- User root: `prompts/prompts/` in this extension's profile storage, typically `<user-data>/User/globalStorage/dmundt.prompteur/prompts/prompts/`.

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

**Add Starter Library** copies 16 editable prompts:

- **Explain:** Explain Selected Code.
- **Plan:** Clarify Requirements; Plan Smallest Useful Implementation; Plan Behavior-Preserving Refactor.
- **Implement:** Implement Scoped Change.
- **Review:** Review Code; Review Complexity; Review Architecture; Review Security; Audit Release Readiness; Audit Implementation Completeness; Audit Accessibility.
- **Test:** Generate Focused Unit Tests.
- **Debug:** Triage Production Incident; Analyze Root Cause.
- **Document:** Document Feature Usage.

- Installation is opt-in. Rerun after updates to add missing starters.
- Never replace existing files, including invalid ones. Writes are safe per-file, not transactional; failures report completed count.

- No import/export or bundles. In-app copies use a temporary window-local buffer; use the filesystem across windows/apps.

## Validation and Safe Writes

- Invalid frontmatter appears as a repairable item and editor diagnostic; unrelated files remain usable.
- Ordinary saves preserve formatting/body. No format-on-save hook.
- Writes use expected-source checks, exclusive locks, synced temp files, atomic replacement, and no-overwrite creation.
- Reject symlink/junction paths. Bound file, library, YAML depth/node, and generated output.
- External writers ignore extension locks; no filesystem sandbox or distributed transaction.

- Docs: [storage](docs/storage.md), [architecture](docs/architecture.md), [commands](docs/api.md), [scope](docs/mvp-scope.md), [verification](docs/verification.md), [icons](docs/icons.md).
- Historical audit/remediation records and older changelog entries describe prior designs.
