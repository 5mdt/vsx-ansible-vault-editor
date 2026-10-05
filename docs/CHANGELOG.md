# Changelog

## Unreleased
- #AVE-0003: vault password lookup like Ansible (`ansibleVault.passwordFile`, env, `ansible.cfg`, keychain, prompt) and the Forget Cached Passwords command; password scripts do not run in untrusted workspaces
- #AVE-0004: vault ID selection on encrypt, and fallback across known secrets on decrypt
- #AVE-0002: the `cli` backend reports a wrong password the same way as `native`
- #AVE-0001: native ansible-vault format (1.1 and 1.2, AES256), read and write, interoperable with `ansible-vault`
- #AVE-0002: crypto backends `native` and `cli`; `ansibleVault.backend` is now `native|cli` (default `native`)
- #BUG-0001: unit and ansible-vault interop tests run in CI on every push
