# AVE-0007. Peek at decrypted values

**Tags:** #inline #ui

## User Story

As a developer reviewing a playbook, I want to see a vaulted value without changing the file, so that I can check it safely.

## Behavior

- Hovering a `!vault` block or a vaulted file's header shows the plaintext in a code block.
- A CodeLens above each block offers "Show value" and "Copy value".
- `ansibleVault.peek` shows the value at the cursor in a notification.
- Nothing is written to disk and the document is not modified.
- If no secret is available the hover offers "Enter password" instead of prompting on its own; if the secret does not match it says "Cannot decrypt". Any other failure (malformed envelope, missing CLI) shows no hover.
- `ansibleVault.hover.enabled` (default `true`) turns the hover off; the CodeLens and command stay.
- `ansibleVault.peekExclude` (list of globs, default empty): files matching it get no hover, no CodeLens, and `peek` refuses.
- `ansibleVault.peek` takes an optional argument `{uri, offset, copy}`, which is how the hover and CodeLens "Copy" links reuse it; with `copy` it copies and shows "Copied" without showing the value. The hover trusts command links for `ansibleVault.peek` and `ansibleVault.editDecrypted` only.
- The hover also covers the first line of a vaulted file; the code fence is longer than any backtick run in the value.
- Copying uses the clipboard; the extension does not clear it.

## UX

See [peek-hover](../ux/modules/peek-hover.md).

## Quirks & Decisions

- Decision: plaintext in a hover is visible to anyone watching the screen, so the hover is opt-out (`ansibleVault.hover.enabled`) and `ansibleVault.peekExclude` keeps chosen files from ever being peeked.

## Testing

### Human

- Hover a block with and without a configured secret.
- Click "Enter password" in the hover, then "Copy" in the hover and in the CodeLens.

### Unit

- Hover provider returns nothing for plain text and for non-password failures; "Enter password" when no secret is available; "Cannot decrypt" for a wrong secret.
- The hover code fence survives values containing backticks.
- Document version unchanged after a peek.

### Extension host

- Hover and CodeLens providers answer on a real document; the document is unchanged after a peek.

## Status

Implemented
