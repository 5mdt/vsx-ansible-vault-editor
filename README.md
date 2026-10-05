# Ansible Vault Editor

VS Code / VSCodium extension for Ansible Vault: encrypt, decrypt and edit vaulted files and inline `!vault` values from the UI. Optional transparent mode decrypts on open and re-encrypts on save.

**Status:** specification stage, extension skeleton only (commands are stubs). The contract lives in [docs/FRD.md](docs/FRD.md); the workflow is described in [docs/DOCS-DRIVEN-DEVELOPMENT.md](docs/DOCS-DRIVEN-DEVELOPMENT.md).

## Development

```sh
npm install
npm run compile   # output goes to build/
```

Press F5 in VS Code to launch the Extension Development Host. All commands are currently stubs.

## Checks

```sh
make ddd       # verify docs consistency
make roadmap   # what is next
```

## License

GPL-3.0, see [LICENSE.md](LICENSE.md).

Copyright (C) 2026 Vladimir Budylnikov (@nett00n), 5mdt
