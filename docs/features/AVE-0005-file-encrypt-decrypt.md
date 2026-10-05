# AVE-0005. Encrypt and decrypt a file

**Tags:** #file #ui

## User Story

As a developer, I want to encrypt or decrypt a whole file from the editor or the Explorer, so that I never drop to the terminal for `ansible-vault`.

## Behavior

| Command                    | On a plain file          | On a vaulted file            |
|----------------------------|--------------------------|------------------------------|
| `ansibleVault.encryptFile` | encrypts                 | refused: "already encrypted" |
| `ansibleVault.decryptFile` | refused: "not encrypted" | decrypts                     |
| `ansibleVault.toggleFile`  | encrypts                 | decrypts                     |

- Available from the Command Palette, the Explorer context menu (multi-select supported) and the editor title.
- The edit is applied as a WorkspaceEdit on the open document, so undo restores the previous text. Closed files in a multi-select are written directly.
- Secret and vault ID follow [AVE-0003](AVE-0003-password-resolution.md) and [AVE-0004](AVE-0004-vault-ids.md).
- A failed item in a multi-select is reported at the end; the others are kept.

## Testing

### Human

- Encrypt a YAML file, undo, redo; decrypt it again.

### Unit

- Refusals in the table; undo stack depth of one per file.

### Integration

- Encrypt in the extension, `ansible-vault view` shows the original.

## Status

Planned
