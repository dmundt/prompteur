# Icons

The extension uses built-in VS Code Codicons for commands, library scopes, and YAML warning rows. Category and prompt rows use text labels without icons. Only two custom icon assets are needed:

- [Activity Bar icon](../resources/activity/prompts.svg): Codicon-like circus tent outline with a flag, open entrance, and one-unit strokes on a 16-unit grid. Explicit white strokes keep the standalone mask visible without a filled silhouette.
- [Marketplace icon](../resources/icon.png): 128×128 red, yellow, and blue circus tent branding image with minimal padding and no frame.

VS Code renders the Activity Bar SVG as a theme-colored mask, not a multicolor image. Its accessible label comes from the Activity Bar container title, **Prompteur**.
