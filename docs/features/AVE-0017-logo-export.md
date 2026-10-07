# AVE-0017. Logo export

**Tags:** #site #tooling

## User Story

As the maintainer, I want the PNG logos and the favicon generated from the Pixelorama source `extension/logo.pxo`, so that the artwork has one source of truth and I do not export by hand.

## Behavior

- `make logo` (`python3 scripts/logo/pxo2png.py extension/logo.pxo build/logo`) writes:
  - `logo.png`, `logo_x2.png`, `logo_x4.png`: the artwork at 1x, 2x and 4x, scaled with nearest neighbour so the pixel art stays crisp;
  - `favicon.ico`: PNG-compressed entries of 16, 32 and 64 pixels (reduced by box averaging, which is exact for these integer ratios).
- The `.pxo` (a zip with `data.json` and raw RGBA layers) is flattened bottom to top: hidden layers are skipped, layer opacity is applied, normal blending only. Any other blend mode, a non-RGBA colour mode, a layer that is not a pixel layer, or more than one frame makes the script fail rather than render something wrong.
- Output goes to the directory given, never into `extension/`; copy the files over to update the committed icons.
- Standard library only; no Pillow or ImageMagick.

## Implementation

- `scripts/logo/pxo2png.py`: `flatten(pxo)`, `scale(rgba, w, h, size)`, `png(rgba, w, h)`, `ico(images)`.

## Quirks & Decisions

- Decision: Python, because reading a zip needs only `zipfile`; Node has no built-in zip reader.
- Decision: the output is checked against the committed `extension/logo_x4.png` pixel by pixel, so a change in the script or the source shows up in the tests.

## Testing

### Human

- Run `make logo`, open the files in `build/logo/`; `favicon.ico` shows in an icon viewer at three sizes.

### Unit

- The 1x, 2x and 4x PNGs decode to the committed `logo.png`, `logo_x2.png` and `logo_x4.png`.
- `favicon.ico` has three entries (16, 32, 64) that are valid PNGs of those sizes.
- A `.pxo` with a hidden layer or an unsupported blend mode: hidden is skipped, unsupported fails.

### Integration

## Status

Implemented
