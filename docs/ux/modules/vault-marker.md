# Module: vault-marker

**Features:** [AVE-0013](../../features/AVE-0013-transparent-vault.md), [AVE-0011](../../features/AVE-0011-save-guard.md)

## View

```text
# ansible-vault: encrypt id=prod        <- whole-file marker, first line
db_user: admin
db_password: s3cret  # ansible-vault: encrypt   <- value marker
```

## States

| State          | Looks like                         |
|----------------|------------------------------------|
| marked         | comment dimmed, lock gutter icon   |
| marker removed | no decoration; save guard may warn |

## Actions

| Control                     | Does                   | Endpoint | Confirm? |
|-----------------------------|------------------------|----------|----------|
| `ansibleVault.toggleMarker` | adds or removes marker | n/a      | no       |
