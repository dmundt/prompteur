# ADR 002: Use Native Editors and Views

Status: Accepted.

Generated previews use native plaintext snapshot documents, not rendered Markdown or a live virtual-document provider. Markdown can be authored as prompt content without being rendered by the extension.

Use one VS Code tree, command palette inputs, native Markdown editors with YAML frontmatter diagnostics, decorations, and untitled plaintext previews. Do not introduce webviews or a frontend framework.

Consequences: keyboard behavior, accessibility, theme adaptation, and editor tooling follow host conventions. Users edit prompt bodies as Markdown without a second UI model. Preview output is independent of later edits; reopen to regenerate. Large category groups use lazy batches. User storage resolves to the desktop profile's local path because current hosts may supply non-file user-data URIs.
