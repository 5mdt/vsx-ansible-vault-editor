# AVE-0022. Demo video

**Tags:** #site #tooling

## User Story

As someone deciding whether to install the extension, I want to watch a short real recording of it working on the landing page, so that I see how it behaves, not only a slideshow of still frames.

## Behavior

A real screen recording of VS Code, driven by the same script that already produces the screenshots, replaces the GIF on the landing page ([AVE-0016](AVE-0016-landing-page.md)). The GIF stays for the two READMEs: GitHub and the Marketplace do not play a `<video>` from a repository path, and Open VSX strips it.

| Surface                       | Shows                       | Why                                      |
|-------------------------------|-----------------------------|------------------------------------------|
| Landing page                  | `demo.webm`                 | real motion, pausable, small             |
| Landing page, no video        | `demo.gif` inside `<video>` | fallback for a browser without WebM/VP9  |
| `README.md`, extension README | `demo.gif` (unchanged)      | the only moving image these hosts render |

### The recording

About 50 seconds, 1280 px wide (the height follows the window's own ratio), silent, 24 fps, VP9 in a WebM, at most 3 MB. Seven scenes of 6-8 seconds, each with a caption burned into the video as an overlay:

| # | Scene                         | Caption                             | Feature                                           |
|---|-------------------------------|-------------------------------------|---------------------------------------------------|
| 1 | encrypt a value, typed slowly | Encrypt one value                   | [AVE-0006](AVE-0006-inline-variable.md)           |
| 2 | hover a `!vault` block        | Peek without touching the file      | [AVE-0007](AVE-0007-peek-decrypted.md)            |
| 3 | edit a vaulted file, save     | Edit decrypted, saved as ciphertext | [AVE-0008](AVE-0008-edit-decrypted.md)            |
| 4 | save a plaintext secret       | The save guard stops a leak         | [AVE-0011](AVE-0011-save-guard.md)                |
| 5 | Problems entry, quick fix     | A warning before you even save      | [AVE-0020](AVE-0020-plaintext-leak-diagnostic.md) |
| 6 | rekey preview                 | Rekey the whole workspace           | [AVE-0010](AVE-0010-rekey-workspace.md)           |
| 7 | decrypted diff                | Review secrets as plaintext diffs   | [AVE-0015](AVE-0015-decrypted-diff.md)            |

Scenes use the command names of [AVE-0019](AVE-0019-command-consolidation.md), so the recording is made after it lands. All data is the generated demo workspace and the password `demo-password`; nothing of the user's machine is captured, because the recording is of the editor window only.

### On the landing page

```html
<video class="demo" width="1280" height="684" poster="demo-poster.jpg"
       muted loop playsinline controls preload="none">
  <source src="demo.webm" type='video/webm; codecs="vp9"'>
  <img src="demo.gif" width="960" height="513" alt="…">
</video>
```

- `demo-poster.jpg` is a frame of scene 2 (peek), shown before playback and when video never starts.
- Playback starts by itself, muted and looping, from a small inline script, unless the visitor prefers reduced motion (`prefers-reduced-motion: reduce`) or has Data Saver on. Native `controls` are always shown, so it can always be paused.
- `preload="none"`: the page loads without waiting for the video, as it does today for the GIF.
- The layout reserves the video's box from `width` and `height`, so nothing shifts when it loads.
- Below the video a one-line text list of the seven captions gives the same content to a screen reader and to anyone who cannot play video.

### Making it

`make screenshots` records the video in the same single run that writes the PNGs; no second pass. Then:

| Step                | Command                                                                                                                                            | Output                                           |
|---------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------|
| record (Playwright) | `make screenshots`                                                                                                                                 | `build/screenshots/frames/*.jpg` + `frames.json` |
| encode              | `scripts/screenshots/video.sh` (ffmpeg concat of the frames using their timestamps, `scale=1280:-2,fps=24`, `libvpx-vp9 -crf 36 -b:v 0`, no audio) | `build/screenshots/demo.webm`, `demo-poster.jpg` |
| publish             | `make screenshots-publish`                                                                                                                         | copies both to `extension/media/`                |

`scripts/release.sh` already regenerates and commits the GIF; it does the same for the WebM and the poster. The files sit in `extension/media/`, which `.vscodeignore` already keeps out of the `.vsix`.

## Implementation

- `scripts/screenshots/run.ts`: once the workbench is visible, call `page.screencast.start({ onFrame, quality: 90 })` and write each frame to `build/screenshots/frames/` with its timestamp (`frames.json`); `page.screencast.stop()` at the end. Add pacing helpers (`typeSlow`, `hold`) and a `caption(page, text)` that injects a fixed bottom overlay into the window, and replace the fixed `settle` gaps in each scene with the holds from the table. The `shot()` PNGs and the GIF keep working unchanged.
- `scripts/screenshots/video.sh`: build an ffmpeg concat list from `frames.json` (each frame lasts until the next; frames arrive at a variable ~16 fps), encode, and extract the poster; fails if the result is over 3 MB or outside 40-70 s (checked with `ffprobe`).
- `scripts/site/build.mjs`: copy `demo.webm` and `demo-poster.jpg`, fill `{{videoWidth}}`, `{{videoHeight}}` from the poster JPEG's SOF header, which has the video's size (no `ffprobe` at site build time), render the video block and the caption list. Missing file, or over the size caps, throws.
- `site/index.html`, `site/style.css`: the markup above, `.demo` rules shared with the GIF's.
- `Makefile`, `scripts/release.sh`: publish and commit the two new files.
- `.vscodeignore` needs no change: `extension/**` is already excluded from the `.vsix`.

## Quirks & Decisions

- Decision: WebM/VP9 only. This machine's ffmpeg (Fedora) has no `libx264`, and `libopenh264` refused to open an encoder (cause not investigated), whereas `libvpx-vp9` works out of the box and is smaller. VP9 WebM plays in current Chrome, Firefox, Edge and Safari 14.1+ (iOS 17.4+); older iOS shows the GIF fallback. Open: add an MP4/H.264 encode when `libx264` is present (CI on Ubuntu has it) if the fallback is seen too often.
- Decision: the video lives in the repository (`extension/media/`), like the GIF, so the Pages build needs no extra download. Quirk: every release adds about 2 MB to the git history. Accepted for now; Open: move the binaries to a release asset if the history grows past a few tens of MB.
- Decision: burned-in captions rather than a `<track>`. The video has no speech; captions only label scenes, and a `<track>` of labels is not supported by autoplay-muted browsers' default UI.
- Decision: the recording happens inside the existing Playwright run, not by grabbing the display (`x11grab`), because that works on Wayland and without a visible window, and captures only the editor.
- Finding (spike, 2026-10-07, Playwright 1.63, VS Code 1.140): passing `recordVideo` to `_electron.launch` **does not work**: VS Code never finishes starting (the window stays at an empty URL and `.monaco-workbench` never appears; the same script without `recordVideo` starts normally). `page.screencast.start({ path })` also fails, as it needs Playwright's own ffmpeg (`npx playwright install ffmpeg`). `page.screencast.start({ onFrame })` after the workbench is up **works**: 206 JPEG frames in 12.9 s (about 16 fps, variable), the whole window including the title bar, not clipped at `window.zoomLevel` 3.8, 447 KB as VP9 for 13 s (so about 1.7 MB for 50 s).
- Quirk: the captured viewport is 1916x1024, not the 1280x800 that `win.setSize` asks for (it is ignored under this Wayland session), and the title bar reads "[Extension Development Host] … - Visual Studio Code" with a "Sign In" button. Proposed: size the output from the real frames, and set `window.title` to `${activeEditorShort}` and hide the account button (`workbench.activity.showAccounts: false`) in the demo settings.
- Quirk: a timing-driven recording is less deterministic than the screenshots; a slow machine stretches waits. Proposed: scenes wait on selectors (as `run.ts` already does) and use `hold` only for reading time, never to wait for the UI.

## UX

See [landing-page](../ux/pages/landing-page.md).

## Testing

### Unit

- `build.mjs` output contains `demo.webm`, `demo-poster.jpg` and `demo.gif`; the page has a `<video>` with `poster`, `muted`, `loop`, `playsinline`, `controls`, `preload="none"`, the poster's real `width` and `height`, and the GIF `<img>` inside it.
- The only relative references in the page are the three media files and the two sibling pages; a missing video, a video over 4 MB or a poster over 150 KB throws.
- The scene list (`SCENES` in `scripts/screenshots/`) has seven entries, each with a caption of at most 40 characters and a hold of 5-9 seconds, and the captions appear in the page's text list.
- The JPEG header reader returns the right width and height for a fixture JPEG.

### Integration

- `make screenshots` on a machine with a display produces the PNGs, the GIF, `demo.webm` (40-70 s, at most 3 MB, 1280 px wide, no audio stream) and the poster.

### Human

- Watch the WebM end to end: every scene is readable, captions do not cover the action, no real path, username or password appears.
- `make site`, open `build/site/index.html` from disk and from the deployed Pages URL: video autoplays muted, pauses from the controls, poster shows with autoplay blocked; with reduced motion on, it waits for a click; with the WebM removed, the GIF shows.

## Status

Planned
