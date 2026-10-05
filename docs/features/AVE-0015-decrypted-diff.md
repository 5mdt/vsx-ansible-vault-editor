# AVE-0015. Decrypted diff

**Tags:** #ui #file #inline

## User Story

As a developer reviewing changes to secrets, I want to see what changed in a vaulted file as plaintext, so that I can review a diff without decrypting anything on disk.

## Behavior

```mermaid
flowchart LR
  S[SCM resource / diff tab / palette] --> C[Open Decrypted Changes]
  C -->|git API| V[two versions: before, after]
  V -->|decrypt in memory| P[ansible-vault-diff: documents]
  P --> D[vscode.diff, read-only]
  D -->|close| X[plaintext dropped]
```

- The built-in git extension owns the SCM view's diff and an extension cannot change what clicking a file there shows, so the plaintext diff is a command: `ansibleVault.openDecryptedChanges` (the SCM Staged group uses a hidden twin, `ansibleVault.openDecryptedStagedChanges`, so the command need not guess the group), offered on SCM resources, the diff editor title, the editor context menu and the Command Palette.
- Versions compared: for the Changes group, the index against the working copy; for the Staged group, HEAD against the index; a new or untracked file has an empty left side.
- A vaulted file is shown as its plaintext. In a file with `!vault` blocks, each block is replaced by its decrypted value, formatted as in Decrypt All Values in File. Both sides are read-only and live only in memory.
- The explicit command may prompt for a password. It refuses with a clear message when the git extension or a repository is missing, or when neither side contains anything vaulted.
- `ansibleVault.enableGitDiff` opts a repository into `git diff` and `git log -p` showing plaintext on the command line too, using a git `textconv` driver; `ansibleVault.disableGitDiff` removes it.
  - Enabling asks for confirmation, then writes the repository's local git config (`diff.ansible-vault.textconv`, `diff.ansible-vault.cachetextconv=false`) and a managed block in `.git/info/attributes` for the globs in `ansibleVault.diffGlobs` (default `*.yml`, `*.yaml`, `*.vault`). No tracked file changes.
  - The driver is a small script shipped with the extension, copied to the extension's global storage so the configured path survives updates. It needs `node` on the PATH, which enabling checks.

## Quirks & Decisions

- Decision: the SCM view itself keeps showing ciphertext. A command is the only hook VS Code offers.
- Decision: the diff documents use the `ansible-vault-diff:` scheme served from memory and are opened through the editor service, like [AVE-0008](AVE-0008-edit-decrypted.md): closing the tab drops the plaintext.
- Decision: the git driver finds secrets only from `ansibleVault.passwordFile` (baked into the command when enabled), `ANSIBLE_VAULT_PASSWORD_FILE` and `ansible.cfg`. There is no keychain and no prompt outside VS Code. Password scripts never run from the driver (the workspace is treated as untrusted), so a cloned repository cannot run code through `git diff`.
- Decision: the driver never fails a diff. With no usable secret it prints the file unchanged, so the diff shows ciphertext as before.
- Decision: `cachetextconv` is off so plaintext is never stored in git's notes cache.
- Decision: attributes go in the local `.git/info/attributes`, not a tracked `.gitattributes`, so enabling it touches nothing that gets committed.
- Quirk: plaintext appears in the output of `git diff`, which can end up in terminal scrollback, pagers and CI logs. The opt-in confirmation says so.
- Quirk: blocks replaced by their values mean the diff text is not valid YAML source to apply. It is for reading.

## UX

See [decrypted-diff](../ux/modules/decrypted-diff.md).

## Testing

### Human

- Commit a vaulted file, change it with Edit Decrypted, then open Decrypted Changes from the SCM view: the diff is plaintext; closing the tab leaves nothing behind.
- Enable the git diff, run `git diff` in a terminal: plaintext. Disable it: ciphertext again, and `git status` shows no tracked-file change at any point.

### Unit

- Plain view of a file, of blocks, multi-line values and CRLF; an undecryptable item either throws or is kept.
- Managed attributes block added, replaced and removed without touching other lines; command quoting.
- The driver prints plaintext, passes a plain file through, prints the input unchanged without a secret, and does not run a password script.

### Integration

- In a real repository with the driver configured, `git diff` of a changed vaulted file shows the plaintext change and no ciphertext.

## Status

Implemented
