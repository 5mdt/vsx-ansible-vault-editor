// #AVE-0007: decide what a peek looks at and read it without ever prompting.

import { createHash } from "node:crypto";
import { fileVaultId } from "../detect";
import { inlineTargets } from "../inline/yaml-values";
import type { SecretResolver } from "../secrets/resolver";
import { decryptQuiet } from "../secrets/vault-ids";
import type { VaultBackend } from "../vault/backend";

export interface PeekTarget {
  kind: "block" | "file";
  ciphertext: string;
  vaultId?: string;
  start: number;
  end: number;
}

export interface PeekOptions {
  /** The hover only covers a vaulted file's first line. */
  headerOnly?: boolean;
}

export type PeekResult =
  | { state: "ok"; plaintext: string; target: PeekTarget }
  | { state: "no-secret" }
  | { state: "wrong" };

// #AVE-0007
export function peekTarget(
  text: string,
  offset: number,
  opts: PeekOptions = {},
): PeekTarget | undefined {
  const file = fileVaultId(text);
  if (file) {
    const firstLineEnd = text.indexOf("\n") < 0 ? text.length : text.indexOf("\n");
    if (opts.headerOnly && offset > firstLineEnd) return undefined;
    return { kind: "file", ciphertext: text, vaultId: file.vaultId, start: 0, end: text.length };
  }
  const { targets, ok } = inlineTargets(text);
  if (!ok) return undefined;
  const block = targets.find((t) => t.vault && offset >= t.start && offset <= t.end);
  return block
    ? {
        kind: "block",
        ciphertext: block.ciphertext ?? "",
        vaultId: block.vaultId,
        start: block.start,
        end: block.end,
      }
    : undefined;
}

/** Undefined when there is nothing to peek at, or the failure is not about the secret. */
// #AVE-0007
export async function peekQuiet(
  text: string,
  offset: number,
  deps: { backend: VaultBackend; resolver: SecretResolver },
  opts: PeekOptions = {},
): Promise<PeekResult | undefined> {
  const target = peekTarget(text, offset, opts);
  if (!target) return undefined;
  try {
    const out = await decryptQuiet(target.ciphertext, deps.backend, deps.resolver);
    if (out.ok) return { state: "ok", plaintext: out.plaintext.toString("utf8"), target };
    return { state: out.reason };
  } catch {
    return undefined;
  }
}

/** A code block whose fence is longer than any backtick run in the value. */
// #AVE-0007
export function hoverMarkdown(plaintext: string): string {
  const longest = Math.max(0, ...(plaintext.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}\n${plaintext}\n${fence}`;
}

/** For tests and callers that need a stable id of a document's text. */
export function textHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
