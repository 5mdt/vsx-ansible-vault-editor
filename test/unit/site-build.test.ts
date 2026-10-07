import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// @ts-expect-error plain JS module without types
import { buildSite } from "../../scripts/site/build.mjs";

const root = resolve(__dirname, "../..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function build(r = root): string {
  const outDir = mkdtempSync(join(tmpdir(), "ave-site-"));
  buildSite({ root: r, outDir });
  return outDir;
}

describe("landing page build", () => {
  // #AVE-0016
  it("writes index.html with the version and one row per command", () => {
    const html = readFileSync(join(build(), "index.html"), "utf8");
    expect(html).toContain(pkg.version);
    for (const c of pkg.contributes.commands) {
      expect(html).toContain(c.command);
    }
    expect(html).not.toContain("{{");
  });

  // #AVE-0016
  it("emits the page, the external demo GIF and .nojekyll", () => {
    const out = build();
    expect(readdirSync(out).sort()).toEqual([".nojekyll", "demo.gif", "index.html"]);
    const html = readFileSync(join(out, "index.html"), "utf8");
    expect(html).not.toMatch(/(?:src|href)="(?!https:|data:|demo\.gif")[^"]+"/);
    expect(html).toContain("<style>");
    expect(html).toMatch(/rel="icon"[^>]*href="data:image\/png;base64,/);
    expect(html).toMatch(/src="demo\.gif" width="960" height="513"/);
  });

  // #AVE-0016
  it("links both marketplaces and the latest .vsix", () => {
    const html = readFileSync(join(build(), "index.html"), "utf8");
    expect(html).toContain("https://marketplace.visualstudio.com/items?itemName=5mdt.ansible-vault-editor");
    expect(html).toContain("https://open-vsx.org/extension/5mdt/ansible-vault-editor");
    expect(html).toContain("https://github.com/5mdt/vsx-ansible-vault-editor/releases/latest/download/ansible-vault-editor.vsix");
  });

  // #AVE-0016
  it("links the 5mdt project site", () => {
    expect(readFileSync(join(build(), "index.html"), "utf8")).toContain('href="https://5mdt.github.io"');
  });

  // #AVE-0016
  it("throws when an asset is missing", () => {
    expect(() => build(mkdtempSync(join(tmpdir(), "ave-empty-")))).toThrow();
  });
});
