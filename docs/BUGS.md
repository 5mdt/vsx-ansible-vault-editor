# Bugs & debt

Next free ID: **BUG-0007**.

Each entry ends with a `[P#/D#]` marker:

Priority: P1 = high P2 = medium P3 = low Difficulty: D1 = trivial D2 = small D3 = medium D4 = large

## Bugs

- #BUG-0006 Detection time grows quadratically with file size: `findVaultBlocks`, `parseMarkers`, `scanText` and `inlineTargets` take about 1 ms for 100 lines, 27 ms for 1k and 280 ms for 4k (`describeDocument` twice that), and `hasVaulted`/`plainView` about 415 ms for 500 `!vault` blocks. Measured by [AVE-0018](features/AVE-0018-benchmarks.md) (`test/bench/baseline/detection-*`). Not yet investigated; suspect per-node work in `inlineTargets` (`src/inline/yaml-values.ts`: `lineStart`, `dashColumn`, `scalarTarget` scanning the whole text), but a profile of `inlineTargets` on the 4k-line corpus comes first. Affects every caller of detection (#AVE-0012, #AVE-0006, #AVE-0013, #AVE-0010, #AVE-0015). [P2/D3]

## Tech debt

## Chores
