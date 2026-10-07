// #AVE-0006: turn a value or block into a text edit; no vscode types.

import { RefusedError } from "../errors";
import type { SecretResolver } from "../secrets/resolver";
import { decryptWithSecrets } from "../secrets/vault-ids";
import type { VaultBackend } from "../vault/backend";
import { seal, type EncryptSession } from "../vault/seal";
import { formatScalar, vaultBlockText, type ValueTarget } from "./yaml-values";

export interface TextEdit {
  start: number;
  end: number;
  newText: string;
}

/**
 * Apply non-overlapping edits in one pass: sort ascending, copy the gaps and
 * replacements into a slice list, join once. Input order does not matter.
 */
// #AVE-0006, #AVE-0008, #AVE-0009, #AVE-0013, #AVE-0015
export function applyTextEdits(text: string, edits: readonly TextEdit[]): string {
  if (!edits.length) return text;
  const sorted = [...edits].sort((a, b) => a.start - b.start);
  const parts: string[] = [];
  let cursor = 0;
  for (const e of sorted) {
    const start = Math.max(e.start, cursor);
    parts.push(text.slice(cursor, start), e.newText);
    cursor = Math.max(cursor, e.end);
  }
  parts.push(text.slice(cursor));
  return parts.join("");
}

// #AVE-0006
export async function encryptValueEdit(
  target: ValueTarget,
  session: EncryptSession,
  eol: "\n" | "\r\n",
): Promise<TextEdit> {
  if (target.vault) throw new RefusedError("already encrypted");
  const cipher = await seal(session, target.value, eol);
  return {
    start: target.start,
    end: target.end,
    newText: vaultBlockText(cipher, target.parentIndent, eol),
  };
}

// #AVE-0006
export async function decryptBlockEdit(
  target: Pick<ValueTarget, "start" | "end" | "ciphertext" | "parentIndent"> & {
    vault?: boolean;
  },
  deps: { backend: VaultBackend; resolver: SecretResolver },
  eol: "\n" | "\r\n" = "\n",
): Promise<TextEdit> {
  if (target.vault === false || target.ciphertext === undefined) {
    throw new RefusedError("not encrypted");
  }
  const out = await decryptWithSecrets(target.ciphertext, deps.backend, deps.resolver);
  return {
    start: target.start,
    end: target.end,
    newText: formatScalar(out.plaintext.toString("utf8"), target.parentIndent, eol),
  };
}
