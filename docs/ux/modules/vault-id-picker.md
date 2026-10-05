# Module: vault-id-picker

**Features:** [AVE-0004](../../features/AVE-0004-vault-ids.md), [AVE-0009](../../features/AVE-0009-rekey.md), [AVE-0010](../../features/AVE-0010-rekey-workspace.md)

## View

```text
┌ Select vault ID ───────────────────┐
│ > prod            (default)        │
│   dev                              │
│   (no ID, vault 1.1 header)        │
└────────────────────────────────────┘
```

## States

| State       | Looks like                           |
|-------------|--------------------------------------|
| several IDs | list above, default pre-selected     |
| one ID      | skipped, ID used silently            |
| none        | skipped, header without ID           |
| rekey       | always shown, plus "New vault ID..." |

## Actions

| Control | Does                      | Endpoint | Confirm? |
|---------|---------------------------|----------|----------|
| Enter   | returns the chosen ID     | n/a      | no       |
| Escape  | cancels the whole command | n/a      | no       |
