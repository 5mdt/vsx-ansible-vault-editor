# AVE-0014. Keybindings

**Tags:** #ui #keys

## User Story

As a keyboard-driven developer, I want every vault action to be bindable to a key, so that I can encrypt and decrypt without the mouse.

## Behavior

The extension ships **no default key bindings**. Every command has a stable ID and is context-aware: with a selection or the cursor in a `!vault` block it acts on the inline value, otherwise on the file.

| Command ID                     | Action                            | Feature                                                                               |
|--------------------------------|-----------------------------------|---------------------------------------------------------------------------------------|
| `ansibleVault.encrypt`         | encrypt selection / value / file  | [AVE-0005](AVE-0005-file-encrypt-decrypt.md), [AVE-0006](AVE-0006-inline-variable.md) |
| `ansibleVault.decrypt`         | decrypt block / file              | AVE-0005, AVE-0006 (same links)                                                       |
| `ansibleVault.toggle`          | encrypt or decrypt as appropriate | AVE-0005, AVE-0006 (same links)                                                       |
| `ansibleVault.peek`            | show / copy plaintext             | [AVE-0007](AVE-0007-peek-decrypted.md)                                                |
| `ansibleVault.editDecrypted`   | open decrypted virtual document   | [AVE-0008](AVE-0008-edit-decrypted.md)                                                |
| `ansibleVault.rekey`           | rekey file / selection            | [AVE-0009](AVE-0009-rekey.md)                                                         |
| `ansibleVault.rekeyWorkspace`  | rekey the workspace               | [AVE-0010](AVE-0010-rekey-workspace.md)                                               |
| `ansibleVault.toggleMarker`    | toggle `# ansible-vault: encrypt` | [AVE-0013](AVE-0013-transparent-vault.md)                                             |
| `ansibleVault.forgetPasswords` | clear remembered passwords        | [AVE-0003](AVE-0003-password-resolution.md)                                           |

Context keys for `when` clauses come from [AVE-0012](AVE-0012-detection-status.md): `ansibleVault.fileIsVaulted`, `ansibleVault.inVaultBlock`, `ansibleVault.hasMarker`.

The README documents this suggested snippet for `keybindings.json`:

```json
[
  { "key": "ctrl+alt+v e", "command": "ansibleVault.encrypt",       "when": "editorTextFocus" },
  { "key": "ctrl+alt+v d", "command": "ansibleVault.decrypt",       "when": "editorTextFocus" },
  { "key": "ctrl+alt+v t", "command": "ansibleVault.toggle",        "when": "editorTextFocus" },
  { "key": "ctrl+alt+v p", "command": "ansibleVault.peek",          "when": "editorTextFocus" },
  { "key": "ctrl+alt+v o", "command": "ansibleVault.editDecrypted", "when": "editorTextFocus" },
  { "key": "ctrl+alt+v r", "command": "ansibleVault.rekey",         "when": "editorTextFocus" },
  { "key": "ctrl+alt+v m", "command": "ansibleVault.toggleMarker",  "when": "editorTextFocus" }
]
```

## Quirks & Decisions

- Decision: no defaults, to avoid clashing with other extensions and desktop shortcuts (`Ctrl+Alt+V` is taken in some Linux environments).
- Decision: `rekeyWorkspace` and `forgetPasswords` are not in the suggested snippet; they are rare and wide in effect.

## Testing

### Unit

- Every command in the table is registered in `package.json` and has a title.
- Contributes no `keybindings` entry.

### Human

- Paste the snippet, run each chord on a plain file, a value and a vaulted file.

## Status

Planned
