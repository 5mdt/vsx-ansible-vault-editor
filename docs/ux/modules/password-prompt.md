# Module: password-prompt

**Features:** [AVE-0003](../../features/AVE-0003-password-resolution.md)

## View

```text
┌ Vault password for "prod" ─────────────────┐
│ --------                                   │
│ [Enter] use once   [Remember in keychain]  │
└────────────────────────────────────────────┘
```

## States

| State        | Looks like                                   |
|--------------|----------------------------------------------|
| first ask    | masked input, two buttons                    |
| wrong secret | input stays, message "does not match", retry |

## Actions

| Control              | Does                             | Endpoint      | Confirm? |
|----------------------|----------------------------------|---------------|----------|
| Enter                | uses the secret for this session | n/a           | no       |
| Remember in keychain | also stores it in SecretStorage  | SecretStorage | no       |
| Escape               | cancels the command              | n/a           | no       |
