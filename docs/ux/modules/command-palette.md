# Module: command-palette

**Features:** [AVE-0019](../../features/AVE-0019-command-consolidation.md)

## View

```text
> Ansible Vault
  Ansible Vault: Encrypt
  Ansible Vault: Decrypt
  Ansible Vault: Toggle
  Ansible Vault: Peek Decrypted Value
  Ansible Vault: Edit Decrypted
  ...
```

```text
Encrypt: what do you want to encrypt?   (cursor on no value)
  Whole file
  Choose values…
```

## States

| State                      | Looks like                  |
|----------------------------|-----------------------------|
| cursor on a value or block | acts at once, no picker     |
| no value, plain YAML       | scope picker above          |
| deprecated ID invoked      | one-time information notice |

## Actions

| Control        | Does                                | Endpoint | Confirm? |
|----------------|-------------------------------------|----------|----------|
| Whole file     | encrypts the file                   | n/a      | no       |
| Choose values… | opens the values picker (keys only) | n/a      | no       |
