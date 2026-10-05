// #AVE-0013: the buffer-only "ansible-vault: encrypt" markers; pure text, no vscode.

import { inlineTargets, type ValueTarget } from "../inline/yaml-values";

const MARKER = /#\s*ansible-vault:\s*encrypt(?:[ \t]+id=(\S+))?[ \t]*$/;
const FILE_MARKER = new RegExp(`^${MARKER.source}`);

export interface FileMarker {
  vaultId?: string;
  /** Offset just past the marker line, including its line break. */
  end: number;
}

export interface ValueMarker {
  target: ValueTarget;
  vaultId?: string;
  /** What to replace when encrypting: the value plus its marker comment. */
  start: number;
  end: number;
  /** Just the `# ansible-vault: ...` comment, for decoration. */
  commentStart: number;
  commentEnd: number;
}

export interface Markers {
  file?: FileMarker;
  values: ValueMarker[];
}

function lineEnd(text: string, from: number): number {
  const nl = text.indexOf("\n", from);
  const end = nl < 0 ? text.length : nl;
  return end > from && text[end - 1] === "\r" ? end - 1 : end;
}

// #AVE-0013
export function parseMarkers(text: string): Markers {
  const out: Markers = { values: [] };
  const first = text.slice(0, lineEnd(text, 0));
  const fm = FILE_MARKER.exec(first);
  if (fm) {
    const nl = text.indexOf("\n");
    out.file = { vaultId: fm[1], end: nl < 0 ? text.length : nl + 1 };
  }
  if (!text.includes("ansible-vault:")) return out;
  const { targets, ok } = inlineTargets(text);
  if (!ok) return out;
  for (const t of targets) {
    if (t.vault) continue;
    const le = lineEnd(text, t.start);
    const multiline = t.end > le;
    // Single-line values carry the marker after the value; block scalars on their header line.
    const from = multiline ? t.start : t.end;
    const rest = text.slice(from, le);
    const m = /(\s+)#\s*ansible-vault:/.exec(rest);
    if (!m) continue;
    const comment = MARKER.exec(rest.slice(m.index + m[1].length));
    if (!comment) continue;
    // Anything between the value and the comment other than blanks means the `#` is not a comment.
    if (!multiline && rest.slice(0, m.index).trim() !== "") continue;
    out.values.push({
      target: t,
      vaultId: comment[1],
      start: t.start,
      end: multiline ? Math.max(t.end, le) : le,
      commentStart: from + m.index + m[1].length,
      commentEnd: le,
    });
  }
  return out;
}

// #AVE-0013
export function markerComment(vaultId: string | undefined): string {
  return vaultId ? `# ansible-vault: encrypt id=${vaultId}` : "# ansible-vault: encrypt";
}

/** The text with the first-line marker removed. */
// #AVE-0013
export function stripFileMarker(text: string, marker: FileMarker): string {
  return text.slice(marker.end);
}

/** Adds a marker comment to the end of the line holding `offset`'s value, or the file's first line. */
// #AVE-0013
export function toggleMarkerEdit(
  text: string,
  offset: number,
  eol: "\n" | "\r\n",
): { start: number; end: number; newText: string } | undefined {
  const markers = parseMarkers(text);
  const hit = markers.values.find((v) => offset >= v.start && offset <= v.end);
  if (hit) {
    const t = hit.target;
    const le = lineEnd(text, t.start);
    const from = t.end > le ? t.start : t.end;
    const m = /\s+#\s*ansible-vault:[^\n]*$/.exec(text.slice(from, le));
    if (!m) return undefined;
    return { start: from + m.index, end: le, newText: "" };
  }
  if (markers.file && offset < markers.file.end) {
    return { start: 0, end: markers.file.end, newText: "" };
  }
  const { targets, ok } = inlineTargets(text);
  const target = ok ? targets.find((t) => !t.vault && offset >= t.start && offset <= t.end) : undefined;
  if (target) {
    const le = lineEnd(text, target.start);
    const at = target.end > le ? le : target.end;
    return { start: at, end: at, newText: ` ${markerComment(undefined)}` };
  }
  return { start: 0, end: 0, newText: `${markerComment(undefined)}${eol}` };
}
