// #AVE-0016: static landing page generator; emits index.html, changelog.html, benchmarks.html plus demo.gif. Usage: node scripts/site/build.mjs [outDir]
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// #AVE-0016: the changelog subset of Markdown: headings, bullets, `code`, [text](url)
export function renderChangelog(md) {
  const inline = (t) =>
    escape(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  const out = [];
  let open = false;
  for (const line of md.split("\n")) {
    const heading = /^(#{1,2}) (.+)$/.exec(line);
    const bullet = /^- (.+)$/.exec(line);
    if (open && !bullet) (out.push("</ul>"), (open = false));
    if (heading) out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
    else if (bullet) {
      if (!open) (out.push("<ul>"), (open = true));
      out.push(`<li>${inline(bullet[1])}</li>`);
    }
  }
  if (open) out.push("</ul>");
  return out.join("\n");
}

// #AVE-0016: one table row per baseline file; times in the files are milliseconds
export function renderBenchmarks(dir) {
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`landing page: no benchmark baseline in ${dir}`);
  const num = (n) => (n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toPrecision(3));
  const rows = files.map((f) => {
    const r = JSON.parse(readFileSync(join(dir, f), "utf8"));
    return `<tr><td><code>${escape(f.replace(/\.json$/, ""))}</code></td><td>${num(r.latency.mean)}</td><td>${num(r.throughput.mean)}</td><td>\u00b1${r.latency.rme.toFixed(1)}%</td><td>${r.latency.samplesCount}</td></tr>`;
  });
  return `<table class="bench">\n<tr><th>Case</th><th>Mean (ms)</th><th>ops/s</th><th>RME</th><th>Samples</th></tr>\n${rows.join("\n")}\n</table>`;
}

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

  const subpage = (title, body) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} - Ansible Vault Editor</title>
<link rel="icon" type="image/png" href="${values.favicon}">
<style>
${values.style}
</style>
</head>
<body>
<main>
<p><a href="index.html">&larr; Ansible Vault Editor</a></p>
${body}
</main>
</body>
</html>
`;
  const changelog = subpage("Changelog", renderChangelog(readFileSync(need(join(root, "docs/CHANGELOG.md")), "utf8")));
  need(join(root, "test/bench/baseline"));
  const benchmarks = subpage(
    "Benchmarks",
    `<h1>Benchmarks</h1>\n<p>The committed baseline from <code>make bench-baseline</code>. Figures are specific to the machine that produced them; compare them with a run on your own, not across machines.</p>\n${renderBenchmarks(join(root, "test/bench/baseline"))}`,
  );

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), html);
  writeFileSync(join(outDir, "changelog.html"), changelog);
  writeFileSync(join(outDir, "benchmarks.html"), benchmarks);
  writeFileSync(join(outDir, ".nojekyll"), "");
  copyFileSync(demoFile, join(outDir, "demo.gif"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  buildSite({ root, outDir: resolve(process.argv[2] ?? join(root, "build/site")) });
}
