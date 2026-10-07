# Changelog

## Unreleased
- #BUG-0014: shared `RefusedError` and `seal()` moved out of `inline/` and `commands/` into `src/errors.ts` and `src/vault/seal.ts`
- #BUG-0012: one vault header parser (`src/vault/header.ts`); reading a vault ID no longer decodes the body, and `fileVaultId` no longer requires the `AES256` cipher
- #BUG-0011: one `applyTextEdits` replaces five copies of the reverse-sorted splice; overlapping edits no longer duplicate text
- #BUG-0013: duplicated helpers (`MAX_SCAN`, EOL detection, hashing, line bounds, glob matching, open-document and UTF-8 reads) consolidated into `src/util.ts` and `src/vscode-util.ts`
- #BUG-0016: command-layer duplication removed (failure reporting, `decryptAllInFile`, vault ID pickers)
- #BUG-0015: removed dead `textHash` and `VaultBackend.rekey` and the "not implemented" command fallback; a unit test checks `package.json` commands against the registered handlers
- #BUG-0017: the save guard's state transitions are a pure, unit-tested module (`src/guard/state.ts`)
- #BUG-0018: Prettier formats `src/` and `test/` (`make fmt`); `make lint` fails on unformatted code

## v1.1.0 (2026-10-07)
- Rekey Workspace scan reads files in parallel and skips binaries cheaply.
- Vault encryption, file reads and the diff helper no longer block the extension host.
- Password scripts and secret sources are read once per resolver (cached 30 s, cleared on config change) instead of once per block.
- Cursor moves and saves reuse one parse of the document instead of four to six.
- Detection is linear in file size (about 50 ms for 4k lines, was 280 ms); duplicate YAML keys no longer disable inline edits.
- #AVE-0018: `make bench` runs benchmarks for crypto, detection, rekey and the decrypted diff view and compares them with a committed baseline (`make bench-baseline`)
- #AVE-0017: `make logo` renders `extension/logo.pxo` to the 1x/2x/4x PNGs and a `favicon.ico`
- #AVE-0016: landing page, an HTML file with inlined styles, logo and favicon and the demo GIF as a separate, size-pinned file, generated from `site/` and `package.json` (`make site`) and deployed to GitHub Pages (linked from both READMEs), with a direct link to the latest `.vsix` on GitHub Releases, and the changelog published next to it as `changelog.html` and the benchmark baseline as `benchmarks.html`

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
