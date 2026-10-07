# AVE-0020. Plaintext leak diagnostic

**Tags:** #guard #ui

## User Story

As a developer, I want a warning in the Problems panel when an open file that must be encrypted is plaintext, so that I notice it before I save, commit or push, not only at the moment of saving.

## Behavior

For every open `file:` document whose path matches `ansibleVault.mustEncryptGlobs` ([AVE-0011](AVE-0011-save-guard.md)), the extension publishes one diagnostic when the document is plaintext and non-empty.

| Aspect       | Value                                                                                                                     |
|--------------|---------------------------------------------------------------------------------------------------------------------------|
| Source       | `Ansible Vault`                                                                                                           |
| Code         | `ansibleVault.plaintext`                                                                                                  |
| Severity     | Warning                                                                                                                   |
| Range        | the first line of the document                                                                                            |
| Message      | `This file matches ansibleVault.mustEncryptGlobs but is not encrypted.`                                                   |
| Quick fix    | `Encrypt file`, which runs `ansibleVault.encrypt` with the document's URI ([AVE-0019](AVE-0019-command-consolidation.md)) |
| Refreshed on | open, change (debounced 300 ms), save, close (cleared), `mustEncryptGlobs` change                                         |

A document is **not** flagged when:

- it is vaulted (header `$ANSIBLE_VAULT;`), or empty or whitespace-only;
- it is a transparent-mode buffer, decrypted in memory while the file on disk is ciphertext ([AVE-0013](AVE-0013-transparent-vault.md), `GuardHandle.isTransparent`);
- the setting `ansibleVault.leakDiagnostics` is `false` (default `true`).

The check reads only the open buffer. It never decrypts, prompts, runs a password script or touches the disk, so it is as cheap as detection ([AVE-0012](AVE-0012-detection-status.md)). Files that are not open are not checked.

## Implementation

- A new `src/guard/diagnostics.ts` with a pure `leakDiagnostic(text, matchesGlob, transparent)` that returns the diagnostic or nothing, and a thin registration function using one `DiagnosticCollection`.
- Glob matching reuses the helper the guard already uses (`src/util.ts`).
- The quick fix is a `CodeActionProvider` offered only on this extension's own diagnostic, so it needs no language filter beyond the files the diagnostic marks.

## Quirks & Decisions

- Decision: open files only (not a workspace scan), so there is no CPU cost and no noise on large repositories. A workspace scan would be a separate feature.
- Decision: file-level glob matches only. A `# ansible-vault: encrypt` marker on a plaintext value is covered by the save guard but not flagged here. Open: flag marked values too, on the marked scalar's range?
- Quirk: a file matched by a glob but intentionally plaintext (an example or template) is flagged forever. Proposed: use a narrower glob or `Save anyway`; no per-file suppression until someone asks.

## UX

See [leak-diagnostic](../ux/modules/leak-diagnostic.md).

## Testing

### Unit

- `leakDiagnostic`: plaintext match flagged; vaulted, empty, non-matching and transparent-buffer cases not.

### Integration

- Open a matching plaintext file: one diagnostic. Apply the quick fix: the diagnostic disappears. Change the globs: it is recomputed. Close the file: it is cleared.

### Human

- A real repository with `mustEncryptGlobs: ["**/group_vars/**/vault.yml"]`.

## Status

Planned
