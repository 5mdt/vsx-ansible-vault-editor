# AVE-0012. Detection and status

**Tags:** #ui

## User Story

As a developer, I want to see at a glance whether a file or value is vaulted, so that I know what the commands will do.

## Behavior

- A document is *vaulted* when its first line is a `$ANSIBLE_VAULT;` header; a `!vault` tag with a following block is an *inline block*.
- The status bar item ([status-item](../ux/modules/status-item.md)) shows the state of the active editor:

| State                         | Item          |
|-------------------------------|---------------|
| vaulted file, vault ID `prod` | `🔒 prod`     |
| vaulted file, no ID           | `🔒 vault`    |
| contains inline blocks        | `🔒 N inline` |
| decrypted by transparent mode | `🔓 marked`   |
| nothing                       | hidden        |

- Clicking the item runs the toggle command for the file or the nearest block.
- Context keys published for `when` clauses: `ansibleVault.fileIsVaulted`, `ansibleVault.inVaultBlock`, `ansibleVault.hasMarker`.
- `!vault` blocks are decorated with a subtle background and are foldable.
- Detection is local text scanning and never needs a password.

## UX

See [status-item](../ux/modules/status-item.md).

## Testing

### Unit

- Detection for file header, blocks, CRLF, indented blocks, false positives in comments.
- Context keys follow cursor movement.

### Human

- Status item changes as the cursor moves between plain and vaulted values.

## Status

Planned
