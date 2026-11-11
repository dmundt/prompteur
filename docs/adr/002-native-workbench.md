# ADR 002: Use Native Editors and Views

Status: Accepted.

Generated previews use native plaintext snapshots, not rendered Markdown or live virtual documents. Prompt bodies may contain Markdown; the extension does not render them.

Use one VS Code tree, Command Palette inputs, native Markdown editors/frontmatter diagnostics, decorations, and untitled plaintext previews. No webviews or frontend framework.

Consequences:

- Host provides keyboard, accessibility, theme, and editor behavior.
- Users edit Markdown directly; no second UI model.
- Previews are independent snapshots; reopen to regenerate.
- Large categories use lazy batches.
- Resolve User storage through local profile path when VS Code returns a non-file URI.
