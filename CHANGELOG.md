# Changelog

## Unreleased

## 1.1.0

- Copy Text no longer interrupts for missing filename/workspace context; reports missing context after copying. Empty clipboard input still requires confirmation. Review Code starter no longer requires filename/workspace variables; existing saved prompts remain unchanged.
- Add a read-only Copilot prompt search/render tool.
- Prefer exact prompt names in Copilot; keep duplicates explicit and retrieve chosen candidates by scope/path without substituting missing prompts. Explain copy actions in prompt-row hover.
- Rename actions to **Copy Text** and **New**. Enable **Paste Prompt** only after copying a prompt. Hide **Duplicate**, retaining command compatibility.

## 1.0.0

- Promote the 0.5.0 beta to the first stable release; prompt format remains version 1.
