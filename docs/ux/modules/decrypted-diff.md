# Module: decrypted-diff

**Features:** [AVE-0015](../../features/AVE-0015-decrypted-diff.md)

## View

```text
SCM view                         Diff tab
 Changes                          ┌ secrets.yml (decrypted) ──────────────┐
  secrets.yml   [right-click]     │ - db_password: old                    │
   ├ Open Decrypted Changes       │ + db_password: new                    │
   └ ...                          └───────────────────────────────────────┘

┌ Enable decrypted git diff? ─────────────────────────────────────┐
│ Writes this repository's local git config and .git/info/       │
│ attributes. Plaintext will appear in `git diff` output.        │
│                    [Enable]  [Cancel]                           │
└─────────────────────────────────────────────────────────────────┘
```

## States

| State           | Looks like                                          |
|-----------------|-----------------------------------------------------|
| diff open       | read-only side-by-side, title `<file> (decrypted)`  |
| nothing vaulted | notification: nothing to decrypt in this change     |
| no git          | notification: git extension or repository not found |

## Actions

| Control                    | Does                                      | Endpoint | Confirm? |
|----------------------------|-------------------------------------------|----------|----------|
| Open Decrypted Changes     | opens the plaintext diff for the file     | n/a      | no       |
| Enable Decrypted git diff  | configures textconv for the repository    | n/a      | yes      |
| Disable Decrypted git diff | removes the config and managed attributes | n/a      | no       |
