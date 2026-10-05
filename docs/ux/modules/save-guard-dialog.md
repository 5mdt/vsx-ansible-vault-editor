# Module: save-guard-dialog

**Features:** [AVE-0011](../../features/AVE-0011-save-guard.md), [AVE-0013](../../features/AVE-0013-transparent-vault.md)

## View

```text
┌ secrets.yml is about to be saved decrypted ─┐
│ [Re-encrypt and save] [Save anyway] [Cancel]│
└─────────────────────────────────────────────┘
```

## States

| State | Looks like       |
|-------|------------------|
| warn  | three buttons    |
| block | no "Save anyway" |

## Actions

| Control             | Does                | Endpoint | Confirm? |
|---------------------|---------------------|----------|----------|
| Re-encrypt and save | encrypts then saves | n/a      | no       |
| Save anyway         | saves plaintext     | n/a      | no       |
| Cancel              | aborts the save     | n/a      | no       |
