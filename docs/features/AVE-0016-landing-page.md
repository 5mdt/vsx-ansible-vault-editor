# AVE-0016. Landing page

**Tags:** #site #docs

## User Story

As someone who has heard of the extension, I want one page that shows what it does and links to every place I can install it, so that I can decide and install without reading the repository.

## Behavior

- A static site is generated from `site/` and `package.json` into `build/site/` (`index.html` and `demo.gif`) by `make site` (`node scripts/site/build.mjs`). No runtime dependencies and no client-side framework.
- The page has: a hero (logo, name, one-line description, version), install buttons for the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=5mdt.ansible-vault-editor) and [Open VSX](https://open-vsx.org/extension/5mdt/ansible-vault-editor), a direct download link for the [latest `.vsix`](https://github.com/5mdt/vsx-ansible-vault-editor/releases/latest/download/ansible-vault-editor.vsix) on GitHub Releases (with the `--install-extension` command for it), the demo GIF, a feature list, the command table and a footer with links to the source, the changelog, the license and the [5mdt](https://5mdt.github.io) project site.
- The version and the command table are read from `package.json` at build time, so they cannot drift from the extension. Feature copy lives in `site/index.html`.
- `.github/workflows/pages.yml` builds the site and deploys it to GitHub Pages on every push to `main` that touches `site/`, `scripts/site/`, `package.json` or `extension/`, and on manual dispatch.
- The stylesheet is inlined and the logo and favicon are `data:` URIs; the demo GIF (~400 KB) is the one external file, `demo.gif` next to `index.html`, so the page renders without waiting for it. The `<img>` carries `width` and `height` read from the GIF header at build time, so the layout does not shift when it loads (CSS scales it down on narrow screens, keeping the ratio). The relative path works under any path or domain, and from disk.
- The favicon is the 64px `extension/logo.png` (already favicon-sized and crisp as pixel art), embedded as a PNG `data:` URI.
- The three install buttons (Marketplace, Open VSX, `.vsix`) share one outlined style and fill with the accent colour on hover and keyboard focus; they sit in a row and wrap onto their own lines on a narrow screen.
- Both READMEs link to the deployed page at `https://5mdt.github.io/vsx-ansible-vault-editor/`.
- The page supports light and dark colour schemes and a phone-width layout.

## Implementation

- `scripts/site/build.mjs`: `buildSite({ root, outDir })` substitutes `{{version}}`, `{{commands}}`, `{{style}}`, `{{logo}}`, `{{favicon}}`, `{{demoWidth}}` and `{{demoHeight}}` in `site/index.html`, writes the result and `.nojekyll`, and copies `demo.gif`.
- `site/index.html`, `site/style.css`: the template and the stylesheet that gets inlined.

## Quirks & Decisions

- Decision: a dependency-free Node script rather than a static-site generator; the page is one screen and the repository already uses Node.
- Decision: the build fails if a placeholder is left unresolved or an asset is missing, so Pages never deploys a broken page.
- Decision: the `.vsix` link uses `releases/latest/download/`, so it never needs a version bump; it relies on `publish.yml` attaching the file under the fixed name `ansible-vault-editor.vsix`.
- Quirk: GitHub Pages must be set to the "GitHub Actions" source in the repository settings once.

## UX

See [landing-page](../ux/pages/landing-page.md).

## Testing

### Human

- Run `make site`, open `build/site/index.html` from disk: logo, favicon and GIF load, the network tab shows two requests (page and GIF), both install buttons open the right listings, dark mode follows the OS.
- After the first deploy, the Pages URL shows the same page.

### Unit

- The build writes `index.html` with the `package.json` version and one row per contributed command, and leaves no `{{` placeholder.
- The output is only `index.html`, `demo.gif` and `.nojekyll`; the page has an inline `<style>`, a PNG favicon as a `data:` URI, and the only relative reference is `demo.gif` with the GIF's real `width` and `height`; a missing asset makes the build throw.
- Both marketplace URLs and the latest-release `.vsix` URL are present in the output.

### Integration

## Status

Implemented
