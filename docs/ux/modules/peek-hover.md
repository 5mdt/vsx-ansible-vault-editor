# Module: peek-hover

**Features:** [AVE-0007](../../features/AVE-0007-peek-decrypted.md)

## View

```text
  db_password: !vault |
  ┌────────────────────────────┐
  │ s3cret                     │
  │ [Copy] [Edit decrypted]    │
  └────────────────────────────┘
```

## States

| State        | Looks like                |
|--------------|---------------------------|
| decrypted    | plaintext in a code block |
| no secret    | "Enter password" link     |
| wrong secret | "Cannot decrypt" message  |

## Actions

| Control        | Does                              | Endpoint  | Confirm? |
|----------------|-----------------------------------|-----------|----------|
| Copy           | copies plaintext                  | clipboard | no       |
| Edit decrypted | runs `ansibleVault.editDecrypted` | n/a       | no       |
