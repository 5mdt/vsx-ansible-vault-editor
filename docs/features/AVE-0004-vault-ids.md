# AVE-0004. Vault IDs

**Tags:** #secrets

## User Story

As a developer with separate dev and prod secrets, I want to pick and keep a vault ID per encrypted item, so that each item is protected by the right password.

## Behavior

| Operation                                     | Rule                                                   |
|-----------------------------------------------|--------------------------------------------------------|
| Encrypt, one ID known                         | use it, write a 1.2 header                             |
| Encrypt, several IDs known                    | QuickPick, default pre-selected                        |
| Encrypt, no IDs known                         | `ansibleVault.defaultVaultId`, else 1.1 header (no ID) |
| Decrypt, 1.2 header                           | use that ID's secret                                   |
| Decrypt, 1.1 header, or the ID's secret fails | try every known secret; first HMAC match wins          |

- Known IDs come from `vault_identity_list`, the setting `ansibleVault.defaultVaultId`, and remembered keychain entries ([AVE-0003](AVE-0003-password-resolution.md)).
- Escaping the picker or the prompt cancels the whole command. When every candidate fails and the prompt is cancelled, the error is "no secret matched".
- The picker may be bypassed with the `id=` hint of a marker ([AVE-0013](AVE-0013-transparent-vault.md)).

## UX

See [vault-id-picker](../ux/modules/vault-id-picker.md).

## Testing

### Human

- Encrypt with two IDs configured; the picker lists both and the header carries the choice.

### Unit

- Selection table above, each row.
- Fallback tries all secrets and reports "no secret matched" when none work.

### Integration

- A file encrypted with `--vault-id prod@file` decrypts with only the prod secret available.

## Status

Implemented
