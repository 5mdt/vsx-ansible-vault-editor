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
| Selection                  | selected text is the value              | n/a                    |
| Cursor on a scalar         | that scalar                             | n/a                    |
| Cursor in a `!vault` block | refused: "already encrypted"            | block becomes a scalar |
| Command "all in file"      | every plain scalar chosen via QuickPick | every `!vault` block   |

- The block is indented two spaces deeper than its key; list items (`- !vault |`) are handled the same way.
- Multiline selections encrypt as one value with the newline preserved.
- Decrypt emits a plain scalar when safe, otherwise a quoted or block scalar so YAML round-trips the exact text.
- Offered as a CodeAction (lightbulb) on a scalar or block, and from the Command Palette and editor context menu.
- Secret and vault ID follow [AVE-0003](AVE-0003-password-resolution.md) and [AVE-0004](AVE-0004-vault-ids.md). Ciphertext lines use the file's EOL ([AVE-0001](AVE-0001-vault-format.md)).

## Quirks & Decisions

- Decision: values are located with a YAML-aware parser that keeps ranges, not regexes, so comments and anchors survive.

## Testing

### Human

- Encrypt and decrypt a value under a nested key and under a list item; the file diff is only that value.

### Unit

- Scalars with colons, quotes, `#`, leading spaces, multiline text round-trip.
- Indentation for nested maps and list items.
- CRLF file keeps CRLF in the block.

### Integration

- `ansible-playbook --ask-vault-pass` reads a block written by the extension.

## Status

Planned
