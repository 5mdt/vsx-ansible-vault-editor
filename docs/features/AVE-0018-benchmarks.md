# AVE-0018. Benchmarks

**Tags:** #tooling #perf

## User Story

As the maintainer, I want to see how fast the hot paths are and whether a change made them slower, so that a performance regression is noticed before a user feels it.

## Behavior

- `make bench` runs every `test/bench/*.bench.ts` with `vitest bench`, writes one result file per case to `build/bench/` and prints each case next to its baseline from `test/bench/baseline/` (a case without a baseline file is printed alone).
- `make bench-baseline` (`AVE_BENCH_BASELINE=1`) writes `test/bench/baseline/` from a fresh run instead. The baseline is committed.
- Covered: the crypto core ([AVE-0001](AVE-0001-vault-format.md), [AVE-0002](AVE-0002-crypto-backends.md)), detection and parsing ([AVE-0006](AVE-0006-inline-variable.md), [AVE-0012](AVE-0012-detection-status.md), [AVE-0013](AVE-0013-transparent-vault.md)), rekey ([AVE-0009](AVE-0009-rekey.md), [AVE-0010](AVE-0010-rekey-workspace.md)) and the decrypted diff view ([AVE-0015](AVE-0015-decrypted-diff.md)).
- Report and compare only. The benchmarks are not part of `make test`, `make all` or CI, and nothing fails on a slowdown.

## Implementation

- `test/bench/corpus.ts`: `payload`, `vaultFile`, `yamlWithBlocks`, `stubDecrypt`, `nativeDecrypt` and `suite`, which registers one benchmark test per case and handles the baseline.
- `test/bench/crypto.bench.ts`, `detect.bench.ts`, `rekey.bench.ts`, `diff.bench.ts`.
- `vitest.config.ts` (`benchmark.include`), `package.json` scripts `bench` and `bench:baseline` (the `verbose` reporter is what prints the comparison), `Makefile` targets of the same names.

## Quirks & Decisions

- Decision: the baseline is machine-specific. Deltas mean something only on the machine that produced it; regenerate it after switching machines.
- Decision: corpora and ciphertext are built at module load, outside the timed body, with fixed salts, so runs compare.
- Decision: native decryption is PBKDF2-bound (10000 iterations) and swamps everything else, so the text-splicing paths are also measured with a stub decrypt.
- Decision: iterations are capped (tinybench's default minimum of 64 is far too many for the slower cases) and the PBKDF2-bound cases run a fixed 5, so the suite takes about 90 seconds.
- Decision: detection is measured up to 4k lines only; `findVaultBlocks`, `parseMarkers` and `describeDocument` grow roughly quadratically with file size, so larger files take minutes per call (#BUG-0006).
- Decision: no CI gate; shared runners are too noisy to threshold on.

## Testing

### Human

- Run `make bench` twice in a row; each case's figure and its `(baseline)` row stay within a few percent.
- `make bench-baseline` rewrites the files in `test/bench/baseline/`.

### Unit

### Integration

## Status

Implemented
