import { parse as yamlParse } from "yaml";

const parse = (t: string) => yamlParse(t, { logLevel: "silent" });
import { describe, expect, it } from "vitest";
import {
  formatScalar,
  inlineTargets,
  plainScalars,
  scalarAt,
  scalarInSelection,
  vaultBlockText,
} from "../../src/inline/yaml-values";

const FAKE = "$ANSIBLE_VAULT;1.1;AES256\n6162\n6364\n";

const values = [
  "plain",
  "a: b",
  "it's",
  'say "hi"',
  "# hash",
  "a #b",
  " leading",
  "trailing ",
  "- dash",
  "{brace}",
  "[bracket]",
  "*star",
  "&amp",
  "!bang",
  "@at",
  "%pct",
  "x\ty",
  "unicode héllo",
  "",
  "null",
  "true",
  "multi\nline",
  "multi\nline\n",
  "multi\nline\n\n",
  "  indented first\nsecond",
  "has\r\ncr",
];

function same(parsed: unknown, v: string): boolean {
  return parsed === v || (typeof parsed !== "object" && parsed !== null && String(parsed) === v);
}

// #AVE-0006
describe("formatScalar round-trips through the YAML parser", () => {
  for (const indent of [0, 2, 4]) {
    for (const v of values) {
      it(`indent ${indent}: ${JSON.stringify(v)}`, () => {
        const pad = " ".repeat(indent);
        const text = `${pad}k: ${formatScalar(v, indent, "\n")}\n`;
        expect(same(parse(text).k, v)).toBe(true);
      });
    }
  }

  it("nested map value", () => {
    const text = `a:\n  b: ${formatScalar("x\ny", 2, "\n")}\n  c: 1\n`;
    expect(parse(text)).toEqual({ a: { b: "x\ny", c: 1 } });
  });

  it("list item value", () => {
    const text = `l:\n  - ${formatScalar("x\ny", 2, "\n")}\n  - z\n`;
    expect(parse(text)).toEqual({ l: ["x\ny", "z"] });
  });

  it("uses the requested EOL for block output", () => {
    const out = formatScalar("x\ny", 0, "\r\n");
    expect(out.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });
});

// #AVE-0006
describe("vault block text", () => {
  const eols: ("\n" | "\r\n")[] = ["\n", "\r\n"];
  it.each(eols)("indents two deeper and is readable back (eol %j)", (eol) => {
    const block = vaultBlockText(FAKE.replace(/\n/g, eol), 2, eol);
    const text = `a:${eol}  b: ${block}${eol}  c: 1${eol}`;
    const { targets } = inlineTargets(text);
    const vault = targets.filter((t) => t.vault);
    expect(vault).toHaveLength(1);
    expect(vault[0].ciphertext).toBe(FAKE);
    expect(vault[0].parentIndent).toBe(2);
    expect(block.startsWith("!vault |")).toBe(true);
    if (eol === "\r\n") expect(block.replace(/\r\n/g, "")).not.toMatch(/\n/);
    expect(block.split(eol)[1]).toBe("    $ANSIBLE_VAULT;1.1;AES256");
  });

  it("list item blocks sit two deeper than the dash", () => {
    const block = vaultBlockText(FAKE, 2, "\n");
    const text = `l:\n  - ${block}\n  - z\n`;
    const { targets } = inlineTargets(text);
    expect(targets.filter((t) => t.vault)).toHaveLength(1);
    expect(parse(text).l[1]).toBe("z");
  });
});

// #AVE-0006
describe("locating scalars", () => {
  const text = [
    "# comment stays",
    "anchor: &a base",
    "db:",
    "  password: s3cret # trailing",
    "  port: 5432",
    "list:",
    "  - first",
    "  - key: nested",
    "quoted: \"a: b\"",
    "",
  ].join("\n");

  it("cursor on a value finds it, with path and indent", () => {
    const t = scalarAt(text, text.indexOf("s3cret") + 2)!;
    expect(t.value).toBe("s3cret");
    expect(t.path).toBe("db.password");
    expect(t.parentIndent).toBe(2);
    expect(text.slice(t.start, t.end)).toBe("s3cret");
  });

  it("cursor at the end of the value still counts", () => {
    const t = scalarAt(text, text.indexOf("s3cret") + 6)!;
    expect(t.value).toBe("s3cret");
  });

  it("cursor on a key, a comment or whitespace finds nothing", () => {
    expect(scalarAt(text, text.indexOf("password") + 2)).toBeUndefined();
    expect(scalarAt(text, text.indexOf("comment") + 2)).toBeUndefined();
    expect(scalarAt(text, 0)).toBeUndefined();
  });

  it("list items and quoted scalars", () => {
    expect(scalarAt(text, text.indexOf("first") + 1)!.path).toBe("list[0]");
    expect(scalarAt(text, text.indexOf("nested") + 1)!.path).toBe("list[1].key");
    const q = scalarAt(text, text.indexOf("a: b") + 1)!;
    expect(q.value).toBe("a: b");
    expect(text.slice(q.start, q.end)).toBe('"a: b"');
  });

  it("a partial selection inside one scalar selects that whole scalar", () => {
    const s = text.indexOf("s3cret");
    const t = scalarInSelection(text, s + 1, s + 3)!;
    expect(t.value).toBe("s3cret");
  });

  it("a selection spanning two nodes is refused", () => {
    const s = text.indexOf("s3cret");
    expect(scalarInSelection(text, s, text.indexOf("5432") + 2)).toBeUndefined();
  });

  it("plainScalars lists values only, not keys or vault blocks", () => {
    const withVault = text + "v: !vault |\n  $ANSIBLE_VAULT;1.1;AES256\n  6162\n";
    const paths = plainScalars(withVault).map((t) => t.path);
    expect(paths).toContain("db.password");
    expect(paths).toContain("list[1].key");
    expect(paths).not.toContain("v");
    expect(paths).not.toContain("db");
  });

  it("comments and anchors elsewhere are byte-identical after an edit", () => {
    const t = scalarAt(text, text.indexOf("s3cret"))!;
    const out = text.slice(0, t.start) + "X" + text.slice(t.end);
    expect(out).toContain("# comment stays");
    expect(out).toContain("&a base");
    expect(out).toContain("# trailing");
  });

  it("invalid YAML reports not ok", () => {
    expect(inlineTargets("a: [unclosed\n").ok).toBe(false);
  });
});

// #AVE-0006, #BUG-0006
describe("duplicate keys and large maps", () => {
  it("still yields targets and ok for a duplicate key", () => {
    const { targets, ok } = inlineTargets("a: 1\nb: 2\na: 3\n");
    expect(ok).toBe(true);
    expect(targets.filter((t) => t.path === "a").map((t) => t.value)).toEqual(["1", "3"]);
  });

  it("is still not ok for a syntax error", () => {
    expect(inlineTargets("a: [1\nb: 2\n").ok).toBe(false);
  });

  it("is roughly linear on a large flat map", () => {
    const make = (n: number) => Array.from({ length: n }, (_, i) => `key${i}: value${i}\n`).join("");
    const time = (n: number) => {
      const t = make(n);
      const s = performance.now();
      inlineTargets(t);
      return performance.now() - s;
    };
    time(1000);
    const small = Math.max(time(4000), 1);
    const big = time(16000);
    // quadratic would be ~16x; allow generous slack for noise
    expect(big).toBeLessThan(small * 10);
    expect(big).toBeLessThan(1500);
  });
});
