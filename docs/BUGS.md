# Bugs & debt

Next free ID: **BUG-0019**.

Each entry ends with a `[P#/D#]` marker:

Priority: P1 = high P2 = medium P3 = low Difficulty: D1 = trivial D2 = small D3 = medium D4 = large

## Bugs

## Tech debt

- #BUG-0011 Reverse-sorted string splicing is copy-pasted five times: `rekeyText`, `plainView`, `decryptForBuffer`, `planSave` and `saveEdit`. Each splice copies the whole text, O(n x k). Proposed: one `applyTextEdits(text, TextEdit[])` next to `TextEdit` in `src/inline/edits.ts`. Affects #AVE-0006, #AVE-0008, #AVE-0009, #AVE-0013, #AVE-0015. [P3/D1]
- #BUG-0012 The vault header is parsed in four places: `HEADER` and `fileVaultId` in `src/detect.ts`, `header()` in `src/inline/yaml-values.ts`, `headerLabel` in `src/vault/backend.ts` and `parseEnvelope` in `src/vault/format.ts`. `DEFAULT_LABEL` is defined twice (`backend.ts`, `src/secrets/ansible-cfg.ts`). `decryptWithSecrets` and `decryptQuiet` call the full `parseEnvelope` (which hex-decodes the body, 33 ms at 1 MB) only to read the vault ID, and the backend then parses it again. Proposed: one header parser in `src/vault/`. Affects #AVE-0001, #AVE-0004, #AVE-0012. [P3/D2]
- #BUG-0013 Small helpers are duplicated. `MAX_SCAN` is defined in four files (`src/rekey/index.ts`, `src/peek/hover.ts`, `src/ui/status.ts`, `src/guard/index.ts`); EOL detection from text appears four times (`src/commands/index.ts`, `src/edit/session.ts`, `src/rekey/rekey.ts`, `src/diff/plain.ts`); three sha256 helpers (`hashText`, `textHash`, `plainHash`); `lineStart` and `lineEnd` are split across `yaml-values.ts` and `src/transparent/markers.ts`; `e instanceof Error ? e.message : String(e)` appears six times; two glob-match helpers (`peekExcluded`, the guard's `globMatch`); three "find the open document by URI" lookups and three "read a file as UTF-8" helpers. Proposed: a small `src/util.ts` and shared `vscode-util` additions. [P3/D1]
- #BUG-0014 Shared pieces live in the wrong layer. `RefusedError` is defined in `src/inline/edits.ts` but imported by seven modules, and `seal()` lives in `src/commands/session.ts` but is used by inline, edit, rekey and transparent code, so lower layers import from `commands/`. Proposed: `src/errors.ts` for the error classes and `src/vault/` for `seal`. [P3/D1]
- #BUG-0015 Dead and stale code. `textHash` in `src/peek/peek.ts` is unused; `VaultBackend.rekey` is implemented twice but only tests call it; `registerCommands` keeps a "not implemented yet" fallback and a comment saying "the rest stay stubs" although all 18 commands have handlers, and its `AVE-0014:` comment is missing the `#`. Open: keep the fallback as a guard that package.json and the handlers agree? [P3/D1]
- #BUG-0016 Duplication in the command layer. The collect-failures-and-join pattern appears three times (`fileCommand`, `decryptAllInFile`, `rekeyWorkspaceCommand`); `decryptAllInFile` re-implements `findVaultBlocks` and calls `getText()` twice; the `target.vaultId === undefined ? { secret } : { vaultId, secret }` ternary is written twice in `src/rekey/index.ts` although both branches equal `{ vaultId, secret }`; `pickVaultId` and `pickRekeyId` build and sort their items the same way. Affects #AVE-0004, #AVE-0005, #AVE-0006, #AVE-0009, #AVE-0010. [P3/D1]
- #BUG-0017 The save guard is an implicit state machine. `registerSaveGuard` (`src/guard/index.ts`) is a 190-line closure with five mutable per-document fields (`pending`, `allow`, `restore`, `held`, `override`) and order-dependent branches in `safeText` and the save handler; the `held` and `pending` branches overlap. Proposed: extract the transitions into a pure, unit-tested module like `src/guard/snapshot.ts`. Affects #AVE-0009, #AVE-0011, #AVE-0013. [P3/D3]

## Chores

- #BUG-0018 No formatter for TypeScript and long lines. `src/rekey/index.ts` has lines of about 190 characters with nested ternaries, and no prettier or dprint is configured; `make lint` only type-checks. [P3/D1]
