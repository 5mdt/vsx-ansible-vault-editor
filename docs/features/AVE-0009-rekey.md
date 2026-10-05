# AVE-0009. Rekey

**Tags:** #rekey

## User Story

As a developer rotating a password or moving a secret to another vault ID, I want to rekey a file or selection, so that I do not decrypt and re-encrypt by hand.

## Behavior

- `ansibleVault.rekey` acts on the vaulted file, or on the `!vault` blocks in the selection (all blocks in the file when nothing is selected inside a block).
- Asks for the new password (twice) and the target vault ID via [vault-id-picker](../ux/modules/vault-id-picker.md).
- The old secret comes from [AVE-0003](AVE-0003-password-resolution.md).
- All-or-nothing per document: every block is decrypted and re-encrypted in memory first; one failure aborts with no edit.
- A single WorkspaceEdit applies the result, so undo reverts it.

- Selection: a vaulted file is rekeyed whole. Otherwise the blocks touched by the selection (an empty selection is the cursor point); none touched means every block in the file.
- The vault ID picker is always shown, even with zero or one known ID, with an extra "New vault ID..." entry.
- On success the session cache holds the new password for the target ID; the keychain entry is left alone, since other files under that ID may still use the old one ([AVE-0010](AVE-0010-rekey-workspace.md) updates it). If a password file, environment variable or `ansible.cfg` supplies that ID, a warning says to update it.
- A document open in transparent mode ([AVE-0013](AVE-0013-transparent-vault.md)) is rekeyed on disk and its cached ciphertext refreshed, so the next save does not write the old key back; its buffer stays plain.

## UX

See [vault-id-picker](../ux/modules/vault-id-picker.md).

## Testing

### Human

- Rekey a file with three blocks; all open with the new password and none with the old.

### Unit

- One bad block aborts the whole edit.
- Vault ID header changes to the chosen ID.

### Integration

- `ansible-vault view --vault-id new@file` reads the rekeyed content.

## Status

Implemented
