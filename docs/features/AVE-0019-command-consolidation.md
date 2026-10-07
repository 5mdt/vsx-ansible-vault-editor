# AVE-0019. Command consolidation

**Tags:** #ui #keys

## User Story

As a developer scanning the command palette, I want one Encrypt, one Decrypt and one Toggle that work out what I mean from the cursor, so that I never have to choose between five near-identical commands.

## Behavior

The 18 commands of [AVE-0014](AVE-0014-keybindings.md) shrink to 13 contributed commands. `encrypt`, `decrypt` and `toggle` are already context-aware in the editor; they now also absorb the file-only and whole-file-only variants.

| Removed                         | Replaced by                                                                  |
|---------------------------------|------------------------------------------------------------------------------|
| `ansibleVault.encryptFile`      | `ansibleVault.encrypt` called with file URI(s)                               |
| `ansibleVault.decryptFile`      | `ansibleVault.decrypt` called with file URI(s)                               |
| `ansibleVault.toggleFile`       | `ansibleVault.toggle` called with file URI(s)                                |
| `ansibleVault.encryptAllInFile` | `ansibleVault.encrypt` with the cursor on no value: scope picker (see below) |
| `ansibleVault.decryptAllInFile` | `ansibleVault.decrypt` with the cursor in no block: every `!vault` block     |

Scope, in order, for `encrypt`, `decrypt` and `toggle`:

1. **URI argument** (Explorer menu, editor title button, multi-select): act on each file. No cursor logic.
2. **Selection or cursor on a value or block** (a YAML scalar): act on that value or block, as in [AVE-0006](AVE-0006-inline-variable.md).
3. **Nothing under the cursor, plain YAML with inline blocks** (`decrypt`): decrypt every `!vault` block in the file.
4. **Nothing under the cursor, plain YAML with plain values** (`encrypt`): a QuickPick offers *Whole file* and *Choose values…*. *Choose values…* is the old `encryptAllInFile` picker (keys only, never the plaintext).
5. **Otherwise**: the whole file, as in [AVE-0005](AVE-0005-file-encrypt-decrypt.md).

`toggle` encrypts when the target is plain and decrypts when it is vaulted; for scope 3 and 4 it decrypts if the file has any `!vault` block under no cursor, else encrypts.

### Deprecation path

The five removed IDs stay **registered but are no longer contributed**: they leave the palette, menus and the `commands` list in `package.json`, but an existing `keybindings.json` entry keeps working. Invoked, an alias runs the replacement and shows a one-time notice per session: "`ansibleVault.encryptFile` is deprecated, use `ansibleVault.encrypt`." The aliases are removed in the next major release.

### Menus

| Menu                         | Before             | After                                        |
|------------------------------|--------------------|----------------------------------------------|
| `explorer/context`           | `encryptFile` etc. | `encrypt`, `decrypt`, `toggle` (same `when`) |
| `editor/title` (lock button) | `toggleFile`       | `toggle`                                     |

## Implementation

- `COMMAND_IDS` in `src/commands/ids.ts` loses the five IDs; a new `DEPRECATED_ALIASES` map (`old id → new id`) is registered separately in `registerCommands`.
- `editorCommand` gains the URI branch (reusing `collectUris` and `fileCommand`) and the two new fallbacks (3, 4), reusing `decryptAllInFile` and `encryptAllInFile` as internal functions.
- The unit test pinning `COMMAND_IDS` to `package.json` also asserts that every alias target is a contributed command and no alias is contributed.

## Quirks & Decisions

- Decision: aliases, not a hard removal. Command IDs live in users' `keybindings.json`, where a missing command fails silently.
- Decision: the whole-file encrypt of a plain YAML file asks first (scope 4) instead of silently encrypting everything, because *Choose values…* is the common intent in a vars file and the whole-file choice is one extra click.
- Quirk: a YAML file with both `!vault` blocks and plain values gives `toggle` two plausible meanings. Proposed: with nothing under the cursor, `toggle` decrypts (the safer direction is the one that shows less, so it asks nothing and writes nothing secret).
- Open: should `rekey` get the same treatment, with `rekeyWorkspace` becoming a scope choice? Not decided; out of scope here.

## UX

See [command-palette](../ux/modules/command-palette.md).

## Testing

### Unit

- `COMMAND_IDS` equals the contributed commands; every alias maps to a contributed ID and is not itself contributed.
- Scope resolution: URI argument, value, block, no-cursor with blocks, no-cursor with plain values, non-YAML.

### Integration

- Existing `encryptFile` / `decryptFile` tests run through `encrypt` / `decrypt` with a URI; one test per alias confirms it still works and notifies once.
- `decrypt` with the cursor outside any block decrypts all blocks in one undo step.

### Human

- Explorer right-click on a file and on a multi-selection; editor title lock button.

## Status

Planned
