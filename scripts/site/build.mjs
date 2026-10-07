// #AVE-0016: static landing page generator; emits index.html plus demo.gif. Usage: node scripts/site/build.mjs [outDir]
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// #AVE-0016
export function buildSite({ root, outDir }) {
  const need = (p) => {
    if (!existsSync(p)) throw new Error(`landing page: missing ${p}`);
    return p;
  };
  const pkg = JSON.parse(readFileSync(need(join(root, "package.json")), "utf8"));
  const rows = pkg.contributes.commands
    .map((c) => `<tr><td>${escape(c.title.replace(/^Ansible Vault: /, ""))}</td><td><code>${escape(c.command)}</code></td></tr>`)
    .join("\n");
  const dataUri = (type, file) => `data:${type};base64,${readFileSync(need(join(root, file))).toString("base64")}`;
  const demoFile = need(join(root, "extension/media/demo.gif"));
  const demo = readFileSync(demoFile); // GIF header: width and height at bytes 6 and 8
  const values = {
    version: escape(pkg.version),
    commands: rows,
    style: readFileSync(need(join(root, "site/style.css")), "utf8"),
    logo: dataUri("image/png", "extension/logo_x4.png"),
    // the 64px logo is already favicon-sized, and nearest-neighbour clean
    favicon: dataUri("image/png", "extension/logo.png"),
    demoWidth: String(demo.readUInt16LE(6)),
    demoHeight: String(demo.readUInt16LE(8)),
  };
  // one pass, so a substituted value is never scanned for placeholders
  const html = readFileSync(need(join(root, "site/index.html")), "utf8").replace(/\{\{(\w+)\}\}/g, (m, k) => values[k] ?? m);
  if (html.includes("{{")) throw new Error("landing page: unresolved placeholder");

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), html);
  writeFileSync(join(outDir, ".nojekyll"), "");
  copyFileSync(demoFile, join(outDir, "demo.gif"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  buildSite({ root, outDir: resolve(process.argv[2] ?? join(root, "build/site")) });
}
