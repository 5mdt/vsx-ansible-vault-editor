# Module: walkthrough

**Features:** [AVE-0021](../../features/AVE-0021-onboarding-docs.md)

## View

```text
Get started with Ansible Vault
 1 ✔ Encrypt a value          [Run Encrypt]
 2   Peek at it               [Run Peek]
 3   Edit it                  [Run Edit Decrypted]
 4   Never leak a secret      [Open setting]
 5   Which command when       [Open README]
```

## States

| State         | Looks like   |
|---------------|--------------|
| step not done | empty marker |
| step done     | check mark   |

## Actions

| Control       | Does                                  | Endpoint | Confirm? |
|---------------|---------------------------------------|----------|----------|
| Run <command> | runs the step's command               | n/a      | no       |
| Open setting  | opens `ansibleVault.mustEncryptGlobs` | n/a      | no       |
| Open README   | opens the decision table              | n/a      | no       |
