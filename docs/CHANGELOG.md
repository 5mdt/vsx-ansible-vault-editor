# Changelog

## Unreleased
- #AVE-0018: `make bench` runs benchmarks for crypto, detection, rekey and the decrypted diff view and compares them with a committed baseline (`make bench-baseline`)
- #AVE-0017: `make logo` renders `extension/logo.pxo` to the 1x/2x/4x PNGs and a `favicon.ico`
- #AVE-0016: landing page, an HTML file with inlined styles, logo and favicon and the demo GIF as a separate, size-pinned file, generated from `site/` and `package.json` (`make site`) and deployed to GitHub Pages (linked from both READMEs), with a direct link to the latest `.vsix` on GitHub Releases

## v1.0.1 (2026-10-05)

- Bump versions

## v1.0.0 (2026-10-05)
- #AVE-0015: `Open Decrypted Changes` (SCM context menu, diff title, palette) shows a vaulted file's change as a plaintext diff held in memory; `Enable Decrypted git diff` makes `git diff` on the command line show plaintext too (`ansibleVault.diffGlobs`)

## v0.4.0 (2026-10-05)
- #AVE-0009: `Rekey` re-encrypts a vaulted file, or the `!vault` blocks in the selection, under a new password and vault ID; all or nothing, one undo step
- #AVE-0010: `Rekey Workspace` previews every vaulted file and block count, then rekeys the ticked ones; files that fail are listed and left untouched; setting `ansibleVault.rekeyExclude`

## v0.3.0 (2026-10-05)
- #AVE-0011: save guard; saving a file that was vaulted when opened, matches `ansibleVault.mustEncryptGlobs` or carries a marker now asks to re-encrypt first (`ansibleVault.saveGuard`: `off`, `warn`, `block`)
- #AVE-0013: transparent mode (`ansibleVault.transparent`); vaulted files and `!vault` values open decrypted and are encrypted again on save, with `# ansible-vault: encrypt` markers and the `Toggle Transparent Marker` command

## v0.2.0 (2026-10-05)
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
