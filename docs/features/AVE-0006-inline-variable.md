# AVE-0006. Inline variable encrypt and decrypt

**Tags:** #inline #ui

## User Story

As a developer, I want to encrypt a single value inside a YAML file, so that the rest of the file stays readable and diffable.

## Behavior

Encrypt turns a scalar into a `!vault` block:

```yaml
db_password: s3cret
```

```yaml
db_password: !vault |
  $ANSIBLE_VAULT;1.1;AES256
  3633...
```

| Target                     | Encrypt                                 | Decrypt                |
|----------------------------|-----------------------------------------|------------------------|
| Selection                  | the scalar containing the selection     | n/a                    |
| Cursor on a scalar         | that scalar                             | n/a                    |
| Cursor in a `!vault` block | refused: "already encrypted"            | block becomes a scalar |
| Command "all in file"      | every plain scalar chosen via QuickPick | every `!vault` block   |

- "All in file" has its own commands: `ansibleVault.encryptAllInFile` (multi-select QuickPick of plain scalars, labelled by key path) and `ansibleVault.decryptAllInFile` (every `!vault` block). Each is a single edit, undone in one step.
- The block is indented two spaces deeper than its key; list items (`- !vault |`) are handled the same way.
- Multiline selections encrypt as one value with the newline preserved.
- Decrypt emits a plain scalar when safe, otherwise a quoted or block scalar so YAML round-trips the exact text.
- Offered as a CodeAction (lightbulb) on a scalar or block, and from the Command Palette and editor context menu.
- Secret and vault ID follow [AVE-0003](AVE-0003-password-resolution.md) and [AVE-0004](AVE-0004-vault-ids.md). Ciphertext lines use the file's EOL ([AVE-0001](AVE-0001-vault-format.md)).

## Quirks & Decisions

- Decision: a selection must lie inside one scalar; that whole scalar is encrypted, so a partial selection never drops the rest of the value. A selection spanning several nodes is refused.
- Decision: decrypt emits the first form that round-trips through the YAML parser to the exact text: plain, then (multi-line text only) literal block (`|`, `|-`, `|+`), then double-quoted.
- Decision: values are located with a YAML-aware parser that keeps ranges, not regexes, so comments and anchors survive.
- Decision (#BUG-0006): a duplicate mapping key does not make the text unusable. The parser's duplicate-key check is off because it is quadratic on large flat maps; a file with a repeated key still yields its targets and edits stay enabled. Any other YAML error still disables edits. Ansible keeps the last duplicate, so edits address each occurrence by its own range.
- Decision (#BUG-0007): the parse result is memoized on the last text, so every caller on the same text (status, folding, CodeLens, code actions, save guard) shares one parse.

## Testing

### Human

- Encrypt and decrypt a value under a nested key and under a list item; the file diff is only that value.

### Unit

- Scalars with colons, quotes, `#`, leading spaces, multiline text round-trip.
- Indentation for nested maps and list items.
- CRLF file keeps CRLF in the block.
- A file with a duplicate key still yields targets and is `ok`; a syntax error is not `ok` (#BUG-0006).
- Locating targets in a 16k-line flat map stays linear, not quadratic (#BUG-0006).
- Repeated calls on the same text parse once (#BUG-0007).

### Integration

- `ansible-playbook --ask-vault-pass` reads a block written by the extension.

## Status

Implemented
