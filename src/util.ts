// #AVE-0001, #AVE-0005, #AVE-0008, #AVE-0013: small pure helpers shared across layers (no vscode import).

import { createHash } from "node:crypto";

/** Documents larger than this many characters are not scanned. */
export const MAX_SCAN = 1_000_000;

// #AVE-0001, #AVE-0008
export function detectEol(text: string): "\n" | "\r\n" {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

// #AVE-0005
export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// #AVE-0008, #AVE-0013
export function hashText(text: string, normalizeEol = false): string {
  return createHash("sha256")
    .update(normalizeEol ? text.replace(/\r\n/g, "\n") : text, "utf8")
    .digest("hex");
}

// #AVE-0013
export function lineStart(text: string, offset: number): number {
  return offset === 0 ? 0 : text.lastIndexOf("\n", offset - 1) + 1;
}

// #AVE-0013
export function lineEnd(text: string, from: number): number {
  const nl = text.indexOf("\n", from);
  const end = nl < 0 ? text.length : nl;
  return end > from && text[end - 1] === "\r" ? end - 1 : end;
}

/** The user-facing text for collected per-item failures; undefined when there are none. */
// #AVE-0005, #AVE-0006, #AVE-0010
export function failureText(failures: string[], lead = ""): string | undefined {
  return failures.length ? `Ansible Vault: ${lead}${failures.join("; ")}` : undefined;
}
