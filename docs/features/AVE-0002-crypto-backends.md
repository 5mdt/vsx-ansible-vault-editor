# AVE-0002. Crypto backends

**Tags:** #crypto #config

## User Story

As a developer, I want to choose between a built-in implementation and my installed `ansible-vault`, so that the extension works without Ansible installed but I can still defer to the real tool when I want.

## Behavior

| Setting                | Values            | Default         |
|------------------------|-------------------|-----------------|
| `ansibleVault.backend` | `native` \| `cli` | `native`        |
| `ansibleVault.cliPath` | path or command   | `ansible-vault` |

| Backend  | Needs Ansible | Works in web/remote  | Format code                          |
|----------|---------------|----------------------|--------------------------------------|
| `native` | no            | yes                  | [AVE-0001](AVE-0001-vault-format.md) |
| `cli`    | yes           | where the CLI exists | `ansible-vault` itself               |

- Both backends expose the same operations: encrypt, decrypt, rekey; callers never know which one ran.
- The `cli` backend passes secrets through a temporary mode-0600 password file or script handed to `--vault-id`, never through argv or the environment. The file is removed in a `finally`.
- If `cli` is selected and the executable is missing, show an error with the actions "Switch to native" and "Open settings". No silent fallback.

## Quirks & Decisions

- Decision: no automatic fallback between backends, so a user who picked `cli` for compliance never gets native crypto unannounced.

## Testing

### Human

- Set `backend: cli` with a bogus `cliPath`; the error offers both actions.

### Unit

- The same fixtures pass through both backends with equal results.
- Temp secret file has mode 0600 and is deleted on success and on failure.
- argv of the spawned process never contains the secret.

### Integration

- With Ansible installed, `cli` output decrypts with `native` and the reverse.

## Status

Planned
