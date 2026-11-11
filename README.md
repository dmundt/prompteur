# Prompteur

For developers who reuse prompts across projects, Prompteur stores them as Markdown files with YAML frontmatter in VS Code.

- Organize prompts by category and tags; find them with full-text search.
- Generate text with optional selection, clipboard, filename, and workspace variables. Copy it for pasting into Chat or another app.
- Preview generated text without modifying source files.
- Keep User prompts in profile-local storage and Workspace prompts in `.vscode/prompts`.
- No account, cloud service, AI provider, or telemetry. Workspace writes, generation, and preview require Workspace Trust.

## Install and Run

Requires desktop VS Code 1.96 or later. Development requires Node.js 22.12 or later.

```sh
npm ci
npm run build
npm run package
code --install-extension prompteur-0.4.4.vsix
```

Press F5 to open an Extension Development Host. Packaging creates a local VSIX; it does not publish to a marketplace.

## Daily Workflow

1. Open **Prompteur**, then **New Prompt**. Choose User or Workspace.
2. Edit and save the Markdown prompt in VS Code's ordinary text editor.
3. Browse category groups or use **Filter Prompts**. Search text or combine exact tag filters, such as `tag:security review`.
4. Open source code and select text if needed, then use **Copy** from the tree or Command Palette.
5. Paste generated text into Chat or another application, including another window. Copy preserves source text; Prompteur does not insert into editors or directly into Chat.

Selection comes from the current or most recently active non-library, non-preview editor in the same window and is read when generating. Selecting a placeholder inside a prompt body does not supply context. Separate VS Code windows do not share editor selections; copy in the source window, then paste in the other window.

Prompt item menus offer edit, duplicate, delete, **Copy Prompt**, and preview. **Copy Prompt** stores the prompt in this VS Code window; **Paste Prompt** on a User/Workspace scope or category creates a new file. Pasting on a category changes the copy's category. The existing **Copy** action still generates prompt text to the OS clipboard. Workspace source copies and Workspace destination writes require trust. All commands are available from the Command Palette under **Prompteur**. **Clear Filter** resets the search; **Reload Libraries** rescans both libraries.

Categories are seven built-in virtual groups, not physical folders: Explain, Plan, Implement, Review, Test, Debug, and Document. Add a profile-wide category from the category picker only after explicit confirmation. Tags are cross-category labels shown beside names. Hover a prompt to click an exact tag or category link to add a filter, or click its relative path to open the Markdown file. Multiple filters must all match; quoted examples include `tag:"security review"` and `category:"review"`. Search also matches names, descriptions, tags, content, and paths; prompts sort alphabetically.

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

YAML frontmatter contains only `version`, `name`, `description`, `category`, and `tags`; the Markdown body is the prompt content. `version: 1`, nonempty `name`, and a built-in or explicitly approved profile category are required. Description and tags default to empty values. Unknown frontmatter fields, unsupported versions, malformed YAML, and aliases are rejected. File paths identify prompts; display names need not be unique. New filenames are readable, with numeric collision suffixes.

Only `selection`, `clipboard`, `filename`, and `workspace` variables are supported. Expansion happens once, then repeated blank lines collapse to one empty line. Empty selections are allowed without a warning and expand to empty text; other empty variable values trigger a warning. Unknown or malformed placeholders block generation. Clipboard contents are read only when requested by a placeholder.

**Preview** opens an independent, editable plaintext snapshot. It does not update after source/context changes. Reopen Preview to regenerate it. Images and HTML are never rendered.

## Libraries

Workspace files live under `.vscode/prompts/prompts/` in the first local workspace folder. User library files live under `prompts/prompts/` inside this extension's current VS Code profile storage directory, typically `<user-data>/User/globalStorage/dmundt.prompteur/prompts/prompts/`.

```text
.vscode/prompts/
  prompts/
    code-review.prompt.md
    engineering/
      incident.prompt.md
```

Nested `.prompt.md` files are discovered recursively but browsed by category. Existing `.yaml` and `.yml` files are ignored and left untouched. Remote/virtual libraries are not supported. Approved extra categories are stored in the current VS Code profile and shared by User and Workspace libraries. Workspace writes, generation, and preview require Workspace Trust; User prompts remain usable in an untrusted workspace.

No library settings or usage state is read or written. Existing `settings.yaml`, old rules, Favorites/MRU data, and other user files are left untouched. Existing YAML prompt files are not converted or loaded; create `.prompt.md` files to use them. Unapproved frontmatter categories appear as repairable items. If an earlier settings file selected a non-default directory, manually move prompt files under `prompts/`.

## Starters

**Add Starter Library** copies 16 ordinary prompts, grouped by their category:

- **Explain:** Explain Selected Code.
- **Plan:** Clarify Requirements; Plan Smallest Useful Implementation; Plan Behavior-Preserving Refactor.
- **Implement:** Implement Scoped Change.
- **Review:** Code Review; Complexity Review; Architecture Review; Security Review; Release Readiness Audit; Implementation Completeness Audit; Accessibility Audit.
- **Test:** Generate Focused Unit Tests.
- **Debug:** Production Incident; Root Cause Analysis.
- **Document:** Document Feature Usage.

Installation is opt-in. Run the command again to add missing starters after an update. Existing destination files, including invalid files, are never replaced. Each file is written safely; installation is not an all-or-nothing transaction, and failures report how many files were added.

No file import/export commands or bundles are provided. In-app prompt copies use a temporary, window-local buffer; use the filesystem to transfer files between VS Code windows or outside VS Code.

## Validation and Safe Writes

Invalid frontmatter appears as a repairable tree item and editor diagnostic. Unrelated broken prompts do not prevent valid prompts from being used. Ordinary saves preserve user formatting and the Markdown body; Prompteur does not install a format-on-save hook.

Extension writes retain expected-source conflict checks, exclusive locks, temporary-file syncing, atomic replacement, and no-overwrite creation. Symlink/junction paths are rejected. File, library, YAML depth/node, and generated-output limits bound resource use. Concurrent external writers do not participate in Prompteur's lock protocol; this is not a filesystem sandbox or distributed transaction.

See [storage](docs/storage.md), [architecture](docs/architecture.md), [commands](docs/api.md), [release scope](docs/mvp-scope.md), and [verification](docs/verification.md). Commands/tree entries use Codicons; the [icon guide](docs/icons.md) covers the remaining SVG and PNG.

Historical audit/remediation documents and older changelog entries describe earlier designs, not the current release boundary.
