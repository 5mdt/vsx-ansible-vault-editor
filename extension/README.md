# Ansible Vault Editor

Encrypt, decrypt and edit [Ansible Vault](https://docs.ansible.com/ansible/latest/vault_guide/index.html) files and inline `!vault` values without leaving the editor. Works in VS Code and VSCodium.

![Demo: encrypt a value, peek at it, edit decrypted, the save guard, rekey workspace and a decrypted diff](https://github.com/5mdt/vsx-ansible-vault-editor/raw/HEAD/extension/media/demo.gif)

## Install

Search for **Ansible Vault Editor** in the Extensions view (VS Code Marketplace, or Open VSX for VSCodium), or install it from the command line:

```sh
code --install-extension 5mdt.ansible-vault-editor
codium --install-extension 5mdt.ansible-vault-editor
```

## Requirements

- VS Code or VSCodium 1.85 or newer.
- Nothing else for the default `native` backend. `ansible-vault` is only needed if you select the `cli` backend, and `node` on the PATH only for the optional decrypted `git diff` driver.

## Features

- **Whole files:** encrypt, decrypt or toggle a file from the Command Palette, the Explorer context menu (multi-select supported) or the editor title button. One undo step per file.
- **Inline values:** put the cursor on a YAML value, or select inside one, and encrypt it to a `!vault |` block. Decrypt puts the plain value back. A lightbulb action appears on values and blocks.
- **Whole-file inline:** `Encrypt Values in File` lets you pick which values to encrypt; `Decrypt All Values in File` decrypts every block at once.
- **Peek without changing anything:** `Peek Decrypted Value` or hover a `!vault` block (or a vaulted file's first line) to see the value, with Copy and Edit decrypted links; a CodeLens above each block offers Show value and Copy value. Needs an already-known password; the hover never prompts.
- **Edit decrypted:** `Ansible Vault: Edit Decrypted` opens the file, or the block under the cursor, in a normal tab. The plaintext lives only in memory; saving re-encrypts with the same vault ID and writes the source. If the file changed on disk meanwhile you choose Overwrite or Reload.
- **Save guard:** saving a file that was vaulted when opened, or matches `ansibleVault.mustEncryptGlobs`, asks first: Re-encrypt and save, Save anyway or Cancel. Nothing is written until you answer.
- **Transparent mode:** with `ansibleVault.transparent` on, vaulted files and `!vault` values open decrypted and are encrypted again on every save, so the disk only ever holds ciphertext. Decrypted items carry a `# ansible-vault: encrypt` marker (first line for a file, trailing comment for a value); type one by hand to vault something new.
- **Rekey:** `Rekey` re-encrypts a vaulted file, or the blocks in your selection, under a new password and a vault ID you pick. `Rekey Workspace` lists every vaulted file with its block count, lets you untick files or filter by vault ID, then rekeys them under a progress notification you can cancel. A file that cannot be opened with a known password is left untouched and reported.
- **Decrypted diffs:** `Open Decrypted Changes` (right-click a changed file in Source Control, the diff tab title, or the Command Palette) opens a read-only plaintext diff held in memory. `Open Decrypted Staged Changes` does the same for staged changes. `Enable Decrypted git diff` (and `Disable Decrypted git diff` to undo it) also makes `git diff` and `git log -p` in a terminal show plaintext, through a git `textconv` driver written to the repository's local config only; it uses the password file or `ansible.cfg` (no keychain, no prompt, no password scripts), needs `node` on the PATH, and plaintext then appears in diff output.
- **Status at a glance:** a status bar item shows `🔒 prod`, `🔒 vault` or `🔒 N inline`; `!vault` blocks are highlighted and foldable.
- **Compatible:** produces and reads the exact `ansible-vault` format (1.1 and 1.2, AES256), including vault IDs. No Ansible install is needed unless you choose the CLI backend.

In a YAML file the commands act on the value under the cursor, or inside the selection; otherwise on the whole file. Every command is listed in the Command Palette under `Ansible Vault:`.

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

## Save guard and transparent mode

A document is *guarded* when it was vaulted when you opened it and is now plaintext, when its path matches `ansibleVault.mustEncryptGlobs`, or when it carries a marker. Saving a guarded plaintext document asks: **Re-encrypt and save**, **Save anyway** or **Cancel** (`block` removes Save anyway; `off` saves as-is). Until you answer, the file on disk is left as it was.

With `ansibleVault.transparent` on, a decrypted item carries a marker, and every marked item is encrypted again on save:

```yaml
# ansible-vault: encrypt id=prod        <- whole file, first line
db_user: admin
db_password: s3cret  # ansible-vault: encrypt   <- single value
```

- The vault ID is the one from the original header, else `id=` in the marker, else `ansibleVault.defaultVaultId`.
- Values you did not change keep their exact ciphertext, so saving without edits leaves `git diff` empty.
- No password on open: the file stays encrypted and you are offered "Enter password". No password on save: nothing is written.
- `Ansible Vault: Toggle Transparent Marker` adds or removes a marker at the cursor. Markers count as "must encrypt" for the save guard even with transparent mode off.
- The tab shows as modified after open and after each save, because the buffer holds plaintext. With `files.autoSave` on, the file is rewritten after every save; the bytes are identical, only the modification time changes.

## Settings

| Setting                         | Default                      | Meaning                                                                                        |
|---------------------------------|------------------------------|------------------------------------------------------------------------------------------------|
| `ansibleVault.backend`          | `native`                     | `native` (built in) or `cli` (your `ansible-vault`)                                            |
| `ansibleVault.cliPath`          | `ansible-vault`              | executable used by the `cli` backend                                                           |
| `ansibleVault.passwordFile`     | empty                        | password file or script, relative to the workspace root                                        |
| `ansibleVault.defaultVaultId`   | empty                        | vault ID used when none is known                                                               |
| `ansibleVault.hover.enabled`    | `true`                       | show decrypted values on hover (CodeLens and Peek stay)                                        |
| `ansibleVault.peekExclude`      | empty                        | globs of files whose values are never shown by hover, CodeLens or Peek                         |
| `ansibleVault.saveGuard`        | `warn`                       | `off`, `warn` (ask) or `block` (ask, no Save anyway) when a secret would be saved in plaintext |
| `ansibleVault.mustEncryptGlobs` | empty                        | globs of files that must never be saved in plaintext                                           |
| `ansibleVault.transparent`      | `false`                      | decrypt on open, encrypt on save                                                               |
| `ansibleVault.rekeyExclude`     | empty                        | globs Rekey Workspace skips, in addition to `files.exclude`                                    |
| `ansibleVault.diffGlobs`        | `*.yml`, `*.yaml`, `*.vault` | files the git diff driver applies to                                                           |

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

## Keeping plaintext off disk

Peek and Edit Decrypted keep plaintext in memory only; transparent mode keeps it in the editor buffer, never in the saved file. One caveat: VS Code's own hot exit can back up unsaved edits of any open document, including decrypted tabs, to its user-data folder. Set `files.hotExit` to `off` to avoid that; the extension warns once the first time you use Edit Decrypted.

## Disclaimer

This extension was developed with the assistance of large language models (LLMs). The code is reviewed and tested, but it handles secrets: review it yourself before relying on it, and keep backups of vaulted files.

## License

GPL-3.0.
