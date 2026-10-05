# AVE-0007. Peek at decrypted values

**Tags:** #inline #ui

## User Story

As a developer reviewing a playbook, I want to see a vaulted value without changing the file, so that I can check it safely.

## Behavior

- Hovering a `!vault` block or a vaulted file's header shows the plaintext in a code block.
- A CodeLens above each block offers "Show value" and "Copy value".
- `ansibleVault.peek` shows the value at the cursor in a notification.
- Nothing is written to disk and the document is not modified.
- If no secret is available the hover offers "Enter password" instead of prompting on its own.
- `ansibleVault.hover.enabled` (default `true`) turns the hover off; the CodeLens and command stay.
- Copying uses the clipboard; the extension does not clear it.

## UX

See [peek-hover](../ux/modules/peek-hover.md).

## Quirks & Decisions

- Quirk: plaintext in a hover is visible to anyone watching the screen. Proposed: keep the hover opt-out, and never show values for files matching `ansibleVault.peekExclude`.

## Testing

### Human

- Hover a block with and without a configured secret.

### Unit

- Hover provider returns nothing for plain text and for failed decrypts.
- Document version unchanged after a peek.

## Status

Planned
