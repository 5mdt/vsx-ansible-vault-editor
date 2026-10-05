# AVE-0011. Save guard

**Tags:** #guard

## User Story

As a developer, I want a warning when I am about to save a secret file in plaintext, so that I never commit a decrypted vault by accident.

## Behavior

A document is *guarded* when any of these holds:

| Signal                                                                                         | Source                                    |
|------------------------------------------------------------------------------------------------|-------------------------------------------|
| It was vaulted when opened and is now plaintext                                                | open-time snapshot                        |
| Its path matches `ansibleVault.mustEncryptGlobs`                                               | setting                                   |
| It carries a `# ansible-vault: encrypt` marker ([vault-marker](../ux/modules/vault-marker.md)) | [AVE-0013](AVE-0013-transparent-vault.md) |

`ansibleVault.saveGuard` decides what happens on save of a guarded plaintext document:

| Value              | Result                                             |
|--------------------|----------------------------------------------------|
| `off`              | save as-is                                         |
| `warn` *(default)* | dialog: Re-encrypt and save / Save anyway / Cancel |
| `block`            | dialog without "Save anyway"                       |

- "Re-encrypt and save" encrypts the whole file or the unencrypted values, then saves.
- Markers are honoured even when `transparent` is off.
- Auto-save is held while a guard dialog is pending.

## UX

See [save-guard-dialog](../ux/modules/save-guard-dialog.md), [vault-marker](../ux/modules/vault-marker.md).

## Testing

### Human

- Decrypt a file with the Decrypt command, press save: the dialog appears.

### Unit

- Guard signals and the three settings.

### Integration

- `block` leaves the file on disk unchanged after cancel.

## Status

Planned
