# AVE-0021. Onboarding docs

**Tags:** #docs #ui

## User Story

As a new user, I want a short guide to which command to use when, both in the README and inside VS Code, so that I can encrypt my first value without reading the command list.

## Behavior

Two surfaces, one source of truth: the decision table lives in [extension/README.md](../../extension/README.md), and the walkthrough links to it.

### README decision table

A `## Which command when` section, placed before `## Key bindings`:

| I want to…                                 | Put the cursor…              | Run                                                         |
|--------------------------------------------|------------------------------|-------------------------------------------------------------|
| encrypt one value                          | on or select the value       | `Encrypt`                                                   |
| encrypt several values of a file           | nowhere in particular        | `Encrypt` → *Choose values…*                                |
| encrypt a whole file                       | anywhere (or right-click it) | `Encrypt` → *Whole file*                                    |
| read a value without changing the file     | in the `!vault` block        | `Peek`                                                      |
| change a value, keeping the file encrypted | in the `!vault` block        | `Edit Decrypted`                                            |
| decrypt one value or a whole file          | in the block, or anywhere    | `Decrypt`                                                   |
| flip whichever state it is in              | anywhere                     | `Toggle`                                                    |
| never save a file in plaintext             | n/a                          | set `mustEncryptGlobs` ([AVE-0011](AVE-0011-save-guard.md)) |

The table uses the command names of [AVE-0019](AVE-0019-command-consolidation.md); it is written after that feature lands.

### VS Code walkthrough

`contributes.walkthroughs` adds **Get started with Ansible Vault**, opened from the Welcome page. Steps, each with a short Markdown page under `extension/walkthrough/` and a button that runs the command:

1. **Encrypt a value**: `Ansible Vault: Encrypt`.
2. **Peek at it**: `Ansible Vault: Peek Decrypted Value`.
3. **Edit it**: `Ansible Vault: Edit Decrypted`.
4. **Never leak a secret**: opens the `ansibleVault.mustEncryptGlobs` setting ([AVE-0011](AVE-0011-save-guard.md), [AVE-0020](AVE-0020-plaintext-leak-diagnostic.md)).
5. **Which command when**: opens the README section.

The walkthrough is not opened automatically on install.

## Implementation

- `package.json` `contributes.walkthroughs`; step pages are plain Markdown, no images beyond the logo.
- A unit test checks that every command a walkthrough step runs is a contributed command (guards against renames, as in [AVE-0019](AVE-0019-command-consolidation.md)).
- The README table is checked by hand; `make ddd` covers the links.

## Quirks & Decisions

- Decision: README and walkthrough both, as the README is what the Marketplace and Open VSX page show and the walkthrough is what VS Code users find on first run.
- Decision: the landing page ([AVE-0016](AVE-0016-landing-page.md)) is not changed; it links to the README.

## UX

See [walkthrough](../ux/modules/walkthrough.md).

## Testing

### Unit

- Every walkthrough `command:` link is a contributed command.

### Human

- Fresh VS Code profile: Welcome → Get started with Ansible Vault; every button works.

## Status

Planned
