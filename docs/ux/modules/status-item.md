# Module: status-item

**Features:** [AVE-0012](../../features/AVE-0012-detection-status.md)

## View

```text
... | Ln 12, Col 4 | YAML | 🔒 prod |
```

## States

| State             | Looks like    |
|-------------------|---------------|
| vaulted file      | `🔒 <id>`     |
| inline blocks     | `🔒 N inline` |
| decrypted, marked | `🔓 marked`   |
| nothing vaulted   | hidden        |

## Actions

| Control | Does                          | Endpoint | Confirm? |
|---------|-------------------------------|----------|----------|
| Click   | toggles file or nearest block | n/a      | no       |
