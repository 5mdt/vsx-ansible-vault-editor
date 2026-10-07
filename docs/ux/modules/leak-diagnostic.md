# Module: leak-diagnostic

**Features:** [AVE-0020](../../features/AVE-0020-plaintext-leak-diagnostic.md)

## View

```text
PROBLEMS
 ⚠ This file matches ansibleVault.mustEncryptGlobs but is not encrypted.
   group_vars/prod/vault.yml [Ln 1]   Ansible Vault (ansibleVault.plaintext)
```

```text
1 │ db_password: hunter2      ← squiggle on line 1
  💡 Encrypt file
```

## States

| State                          | Looks like    |
|--------------------------------|---------------|
| matched, plaintext             | warning       |
| vaulted, empty, or transparent | no diagnostic |
| `leakDiagnostics` off          | no diagnostic |

## Actions

| Control      | Does                                    | Endpoint | Confirm? |
|--------------|-----------------------------------------|----------|----------|
| Encrypt file | runs `ansibleVault.encrypt` on the file | n/a      | no       |
