# ADR 005: Explicit Copilot Prompt Tool

Status: Partially superseded by [ADR 006](./006-configurable-prompt-matching.md) for unique-candidate selection.

Expose saved prompts to Copilot Chat/Agents only through a read-only VS Code Language Model Tool. VS Code mediates invocation and confirmation; the extension does not make model requests or use a direct provider/network client. The tool searches local libraries, returns metadata for ambiguous matches, and renders only a unique match. It cannot modify prompts. Workspace prompt access requires Workspace Trust. Prompt text and any requested context variables become model context.

This ADR supersedes ADR 003 only for the prohibition on AI/provider integration. Preserve its filesystem port, serialized conflict-aware mutations, path/symlink protections, and Workspace Trust rules.

Keep text handoff through **Copy Text** because VS Code exposes no supported API to insert text into the active Chat composer. Do not depend on Copilot Chat as an extension dependency or claim unsupported Agents-window manifest support.

Consequences:

- Users approve tool invocation through VS Code; VS Code may remember **Always Allow**.
- Prompt text and requested selection/clipboard variables are disclosed to the configured model when returned by the tool.
- Local libraries remain authoritative. No automatic prompt invocation, direct model calls, or prompt mutations.
