# Roadmap

| # | Epic                    | Why here                                               |
|---|-------------------------|--------------------------------------------------------|
| 1 | Crypto core             | Everything else calls it; tests already written        |
| 2 | Secrets                 | Every command needs a password and a vault ID          |
| 3 | First release           | Encrypting a file and a value is the core promise      |
| 4 | Read without writing    | Peek and virtual editing only decrypt, low risk        |
| 5 | Safety and transparency | Transparent mode is only safe on top of the save guard |
| 6 | Rekey                   | Rare, wide in effect; last                             |
| 7 | Later                   | Promoted todos                                         |

## 1. Crypto core

1. AVE-0001 - format first; its tests are already red
2. AVE-0002 - the `native` backend is AVE-0001, plus the `cli` fallback

**Done when:** native encrypt -> `ansible-vault decrypt` works, and the reverse, in CI.

## 2. Secrets

1. AVE-0003 - every command needs a password
2. AVE-0004 - vault IDs build on the secrets above

**Done when:** a workspace whose `ansible.cfg` points at a password file decrypts without a prompt.

## 3. First release

1. AVE-0012 - detection and the context keys the commands use
2. AVE-0005 - whole-file encrypt and decrypt
3. AVE-0006 - inline values
4. AVE-0014 - command contract; the stubs already meet it, flips when the commands are real
5. #BUG-0002 - bundle before shipping
6. #BUG-0003 - publish to the Marketplace and Open VSX

**Done when:** 0.1.0 is installable from Open VSX and the Marketplace.

## 4. Read without writing

1. AVE-0007 - peek is read-only
2. AVE-0008 - virtual document, no plaintext on disk

**Done when:** a value can be read or edited without plaintext ever reaching disk.

## 5. Safety and transparency

1. AVE-0011 - the guard comes before anything automatic
2. AVE-0013 - transparent mode relies on the guard

**Done when:** after a save in transparent mode, `cat` on the file shows ciphertext.

## 6. Rekey

1. AVE-0009 - one file
2. AVE-0010 - the workspace builds on per-file atomicity

**Done when:** a repo with mixed files is rekeyed and the preview counts match.

## 7. Later

1. #TODO-0001 - decrypted diff in the SCM view

**Done when:** a vaulted file's diff in the SCM view shows plaintext.
