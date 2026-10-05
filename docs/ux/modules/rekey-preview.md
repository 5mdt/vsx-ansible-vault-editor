# Module: rekey-preview

**Features:** [AVE-0010](../../features/AVE-0010-rekey-workspace.md)

## View

```text
┌ Rekey workspace: 7 files, 12 blocks ───────┐
│ Filter ID: [all v]                         │
│ [x] group_vars/prod.yml        3 blocks    │
│ [x] secrets/db.yml             file        │
│ [ ] roles/web/vars/main.yml    2 blocks    │
│            [Cancel]  [Rekey 2 selected]    │
└────────────────────────────────────────────┘
```

## States

| State   | Looks like                         |
|---------|------------------------------------|
| preview | checklist, all ticked              |
| running | progress with Cancel               |
| report  | applied count, failed files listed |

## Actions

| Control | Does                      | Endpoint | Confirm?                      |
|---------|---------------------------|----------|-------------------------------|
| Rekey   | starts the rekey          | n/a      | yes, this is the confirmation |
| Cancel  | stops, nothing is applied | n/a      | no                            |
