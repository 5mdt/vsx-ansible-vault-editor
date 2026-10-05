# Ansible Vault Editor

Encrypt, decrypt and edit [Ansible Vault](https://docs.ansible.com/ansible/latest/vault_guide/index.html) files and inline `!vault` values without leaving the editor. Works in VS Code and VSCodium.

## Features

- **Whole files:** encrypt, decrypt or toggle a file from the Command Palette, the Explorer context menu (multi-select supported) or the editor title button. One undo step per file.
- **Inline values:** put the cursor on a YAML value, or select inside one, and encrypt it to a `!vault |` block. Decrypt puts the plain value back. A lightbulb action appears on values and blocks.
- **Whole-file inline:** `Encrypt Values in File` lets you pick which values to encrypt; `Decrypt All Values in File` decrypts every block at once.
- **Status at a glance:** a status bar item shows `🔒 prod`, `🔒 vault` or `🔒 N inline`; `!vault` blocks are highlighted and foldable.
- **Compatible:** produces and reads the exact `ansible-vault` format (1.1 and 1.2, AES256), including vault IDs. No Ansible install is needed unless you choose the CLI backend.

In a YAML file the commands act on the value under the cursor, or inside the selection; otherwise on the whole file.

## Passwords

The password is found the way Ansible finds it, and you are only prompted when nothing is configured:

1. the `ansibleVault.passwordFile` setting
2. `ANSIBLE_VAULT_PASSWORD_FILE` / `ANSIBLE_VAULT_IDENTITY_LIST`
3. `vault_password_file` / `vault_identity_list` in `ansible.cfg`
4. a password remembered in your keychain
5. a prompt, with a button to remember it in the keychain

Password files may be executables (their output is the password). Executables are never run in an untrusted workspace. Use `Ansible Vault: Forget Cached Passwords` to clear what was remembered.

## Vault IDs

With one known vault ID it is used silently; with several you pick one; with none, `ansibleVault.defaultVaultId` is used, else a plain 1.1 header is written. Decrypting tries the ID in the header first, then every other known secret.

## Settings

| Setting                       | Default         | Meaning                                                 |
|-------------------------------|-----------------|---------------------------------------------------------|
| `ansibleVault.backend`        | `native`        | `native` (built in) or `cli` (your `ansible-vault`)     |
| `ansibleVault.cliPath`        | `ansible-vault` | executable used by the `cli` backend                    |
| `ansibleVault.passwordFile`   | empty           | password file or script, relative to the workspace root |
| `ansibleVault.defaultVaultId` | empty           | vault ID used when none is known                        |

If the `cli` backend is selected and the executable is missing, you are offered "Switch to native" or "Open settings"; there is no silent fallback.

## Key bindings

The extension ships no default key bindings, to avoid clashing with other extensions. Every command can be bound; a suggested `keybindings.json` snippet:

```json
[
  { "key": "ctrl+alt+v e", "command": "ansibleVault.encrypt", "when": "editorTextFocus" },
  { "key": "ctrl+alt+v d", "command": "ansibleVault.decrypt", "when": "editorTextFocus" },
  { "key": "ctrl+alt+v t", "command": "ansibleVault.toggle",  "when": "editorTextFocus" }
]
```

## Not yet available

Peek at decrypted values, edit decrypted, rekey and transparent decrypt-on-open are planned and their commands are placeholders for now.

## License

GPL-3.0.
