# Changelog

## Unreleased
- #AVE-0007: hover and CodeLens show the decrypted value of a `!vault` block or vaulted file without changing it; `Peek` shows or copies it; settings `ansibleVault.hover.enabled` and `ansibleVault.peekExclude`
- #AVE-0008: `Edit Decrypted` opens a vaulted file or a single block in a normal tab whose plaintext lives only in memory; saving re-encrypts with the same vault ID

## v0.1.0 (2026-10-05)
- #AVE-0005: encrypt, decrypt and toggle whole files from the Command Palette, Explorer menu and editor title
- #AVE-0006: encrypt and decrypt single YAML values (cursor, selection or lightbulb), plus `Encrypt Values in File` and `Decrypt All Values in File`
- #AVE-0012: status bar item, context keys, block highlighting and folding for vaulted files and `!vault` values
- #AVE-0014: every command ID is bindable; no default key bindings, suggested snippet in the README
- #BUG-0003: tagging vX.Y.Z publishes to the Marketplace and Open VSX from GitHub Actions
- #BUG-0002: the extension is bundled with esbuild into a single file
- #AVE-0003: vault password lookup like Ansible (`ansibleVault.passwordFile`, env, `ansible.cfg`, keychain, prompt) and the Forget Cached Passwords command; password scripts do not run in untrusted workspaces
- #AVE-0004: vault ID selection on encrypt, and fallback across known secrets on decrypt
- #AVE-0002: the `cli` backend reports a wrong password the same way as `native`
- #AVE-0001: native ansible-vault format (1.1 and 1.2, AES256), read and write, interoperable with `ansible-vault`
- #AVE-0002: crypto backends `native` and `cli`; `ansibleVault.backend` is now `native|cli` (default `native`)
- #BUG-0001: unit and ansible-vault interop tests run in CI on every push
