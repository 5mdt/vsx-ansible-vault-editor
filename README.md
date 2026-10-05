# Ansible Vault Editor

VS Code / VSCodium extension for Ansible Vault: encrypt, decrypt and edit vaulted files and inline `!vault` values from the UI. Optional transparent mode decrypts on open and re-encrypts on save.

**Status:** pre-release. Encrypt and decrypt files and inline `!vault` values, password lookup, vault IDs and the status bar work; peek (hover, CodeLens) and edit-decrypted work; save guard and transparent mode work; rekey (file and workspace) works; decrypted diffs work. The contract lives in [docs/FRD.md](docs/FRD.md); the workflow is described in [docs/DOCS-DRIVEN-DEVELOPMENT.md](docs/DOCS-DRIVEN-DEVELOPMENT.md).

## Layout

| Path                             | Holds                                                               |
|----------------------------------|---------------------------------------------------------------------|
| `src/vault/`                     | vault format and the `native` / `cli` crypto backends               |
| `src/secrets/`                   | password lookup, keychain, vault ID selection                       |
| `src/commands/`                  | encrypt, decrypt and toggle commands                                |
| `src/inline/`                    | YAML value location and `!vault` block edits                        |
| `src/peek/`, `src/edit/`         | hover and CodeLens, virtual decrypted documents                     |
| `src/guard/`, `src/transparent/` | save guard, markers, transparent open and save                      |
| `docs/`                          | feature docs, FRD, roadmap, UX references (docs-driven development) |

## Development

```sh
npm install
npm run compile   # output goes to build/
```

Press F5 in VS Code to launch the Extension Development Host.

```sh
make test              # unit + integration (ansible-vault on PATH enables the interop tests)
make test-extension    # tests inside a real VS Code host
```

## Usage

The Marketplace page for users is [extension/README.md](extension/README.md); this file is for contributors.

## Packaging

```sh
make package   # build/ansible-vault-editor.vsix, bundled with esbuild
```

## Releasing

```sh
make release BUMP=minor   # patch | minor | major, default minor
git push --follow-tags
```

`make release` must run on a clean `main`. It runs pre-commit, `ddd check`, lint, unit and integration tests (ansible-vault required); renames `## Unreleased` in `docs/CHANGELOG.md` to the new version; bumps `package.json` and the lockfile; then commits `release vX.Y.Z` and tags it. Nothing is pushed. The first release is `v0.1.0`.

Pushing a `v*` tag publishes to the Marketplace and Open VSX from GitHub Actions (secrets `VSCE_PAT`, `OVSX_PAT`).

## Checks

```sh
make ddd       # verify docs consistency
make roadmap   # what is next
```

## License

GPL-3.0, see [LICENSE.md](LICENSE.md).

Copyright (C) 2026 Vladimir Budylnikov (@nett00n), 5mdt
