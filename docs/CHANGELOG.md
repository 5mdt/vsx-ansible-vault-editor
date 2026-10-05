# Changelog

## Unreleased
- #AVE-0001: native ansible-vault format (1.1 and 1.2, AES256), read and write, interoperable with `ansible-vault`
- #AVE-0002: crypto backends `native` and `cli`; `ansibleVault.backend` is now `native|cli` (default `native`)
- #BUG-0001: unit and ansible-vault interop tests run in CI on every push
