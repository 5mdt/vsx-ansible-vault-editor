// #AVE-0006: locate and format YAML scalar values with a parser that keeps source ranges.

import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parseAllDocuments,
  parseDocument,
  Scalar,
  type Node,
} from "yaml";

/** A value scalar or `!vault` block, with the range an edit should replace. */
export interface ValueTarget {
  start: number;
  end: number;
  /** Plaintext of a plain value; unused for vault blocks. */
  value: string;
  vault: boolean;
  /** Vault blocks: the envelope text, lines joined with \n. */
  ciphertext?: string;
  vaultId?: string;
  /** Column of the owning key or dash; a block sits two deeper. */
  parentIndent: number;
  path: string;
}

function lineStart(text: string, offset: number): number {
  return offset === 0 ? 0 : text.lastIndexOf("\n", offset - 1) + 1;
}

function trimEol(text: string, end: number): number {
  while (end > 0 && (text[end - 1] === "\n" || text[end - 1] === "\r")) end--;
  return end;
}

/** Column of the dash that owns a list item starting at `offset`, else the line indent. */
function dashColumn(text: string, offset: number): number {
  const ls = lineStart(text, offset);
  const prefix = text.slice(ls, offset);
  for (let i = prefix.length - 1; i >= 0; i--) {
    if (prefix[i] === "-" && /^[\s-]*$/.test(prefix.slice(0, i)) && /\s/.test(prefix[i + 1] ?? "")) {
      return i;
    }
  }
  return /^ */.exec(text.slice(ls))![0].length;
}

function header(ciphertext: string): string | undefined {
  const parts = ciphertext.split(/\r?\n/, 1)[0].trim().split(";");
  return parts[0] === "$ANSIBLE_VAULT" && parts[1] === "1.2" ? parts[3] : undefined;
}

function scalarTarget(
  text: string,
  node: Scalar,
  path: string,
  parentIndent: number,
): ValueTarget | undefined {
  if (!node.range) return undefined;
  const [from, valueEnd, nodeEnd] = node.range;
  if (node.tag === "!vault") {
    const tag = text.lastIndexOf("!vault", from);
    const start = tag >= 0 && /^\s*$/.test(text.slice(tag + 6, from)) ? tag : from;
    const ciphertext = String(node.value);
    return {
      start,
      end: trimEol(text, Math.max(valueEnd, nodeEnd)),
      value: "",
      vault: true,
      ciphertext,
      vaultId: header(ciphertext),
      parentIndent,
      path,
    };
  }
  const end = trimEol(text, node.type?.startsWith("BLOCK") ? nodeEnd : valueEnd);
  if (end <= from) return undefined;
  const source = text.slice(from, end);
  const value =
    node.type === "PLAIN" && !source.includes("\n") ? source : String(node.value);
  return { start: from, end, value, vault: false, parentIndent, path };
}

export interface Targets {
  targets: ValueTarget[];
  /** False when the text is not valid YAML; edits must not trust the ranges. */
  ok: boolean;
}

// #AVE-0006
export function inlineTargets(text: string): Targets {
  const targets: ValueTarget[] = [];
  const docs = parseAllDocuments(text, { logLevel: "silent" });

  const walk = (node: Node | null | undefined, path: string, indent: number): void => {
    if (!node || isAlias(node)) return;
    if (isScalar(node)) {
      const t = scalarTarget(text, node, path, indent);
      if (t) targets.push(t);
    } else if (isMap(node)) {
      for (const pair of node.items) {
        const key = pair.key;
        const label = isScalar(key) ? String(key.value) : "?";
        const col =
          isScalar(key) && key.range ? key.range[0] - lineStart(text, key.range[0]) : indent;
        walk(pair.value as Node | null, path === "" ? label : `${path}.${label}`, col);
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, i) => {
        const range = (item as Node | null)?.range;
        const col = range ? dashColumn(text, range[0]) : indent;
        walk(item as Node | null, `${path}[${i}]`, col);
      });
    }
  };

  for (const doc of docs) walk(doc.contents as Node | null, "", 0);
  return { targets, ok: docs.every((d) => d.errors.length === 0) };
}

// #AVE-0006
export function scalarAt(text: string, offset: number): ValueTarget | undefined {
  const { targets, ok } = inlineTargets(text);
  return ok ? targets.find((t) => offset >= t.start && offset <= t.end) : undefined;
}

// #AVE-0006
export function scalarInSelection(
  text: string,
  start: number,
  end: number,
): ValueTarget | undefined {
  const { targets, ok } = inlineTargets(text);
  return ok ? targets.find((t) => start >= t.start && end <= t.end) : undefined;
}

// #AVE-0006
export function plainScalars(text: string): ValueTarget[] {
  const { targets, ok } = inlineTargets(text);
  return ok ? targets.filter((t) => !t.vault) : [];
}

// #AVE-0006
export function vaultBlockText(
  ciphertext: string,
  parentIndent: number,
  eol: "\n" | "\r\n",
): string {
  const pad = " ".repeat(parentIndent + 2);
  const lines = ciphertext.split(/\r?\n/).filter((l, i, a) => l !== "" || i < a.length - 1);
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  return `!vault |${eol}` + lines.map((l) => pad + l).join(eol);
}

function sameText(parsed: unknown, plain: string): boolean {
  if (typeof parsed === "string") return parsed === plain;
  return parsed !== null && typeof parsed !== "object" && String(parsed) === plain;
}

/** True when `candidate` placed as `k: <candidate>` parses back to exactly `plain`. */
function roundTrips(candidate: string, plain: string, indent: number): boolean {
  try {
    const doc = `${" ".repeat(indent)}k: ${candidate}\n`;
    const parsed = parseDocument(doc, { logLevel: "silent" });
    return parsed.errors.length === 0 && sameText(parsed.toJS()?.k, plain);
  } catch {
    return false;
  }
}

// #AVE-0006
export function formatScalar(
  plain: string,
  parentIndent: number,
  eol: "\n" | "\r\n",
): string {
  const multiline = plain.includes("\n");
  if (!multiline && plain !== "" && roundTrips(plain, plain, parentIndent)) return plain;
  if (multiline) {
    const body = plain.replace(/\n+$/, "");
    const trailing = plain.length - body.length;
    const chomp = trailing === 0 ? "|-" : trailing === 1 ? "|" : "|+";
    const pad = " ".repeat(parentIndent + 2);
    const lines = body.split("\n").map((l) => (l === "" ? l : pad + l));
    for (let i = 1; i < trailing; i++) lines.push("");
    const block = `${chomp}\n${lines.join("\n")}`;
    if (roundTrips(block, plain, parentIndent)) return block.replace(/\n/g, eol);
  }
  return JSON.stringify(plain);
}
