// #AVE-0013: decrypt a vaulted file or its !vault values into marked plaintext, without prompting.

import { fileVaultId, findVaultBlocks } from "../detect";
import { applyTextEdits, type TextEdit } from "../inline/edits";
import { formatScalar } from "../inline/yaml-values";
import type { SecretResolver } from "../secrets/resolver";
import { decryptQuiet } from "../secrets/vault-ids";
import type { VaultBackend } from "../vault/backend";
import { markerComment } from "./markers";
import { hashText } from "../util";
import { type SealCache } from "./seal";

export type OpenResult =
  | { state: "plain"; text: string; cache: SealCache }
  | { state: "nothing" }
  | { state: "no-secret" };

// #AVE-0013
export async function decryptForBuffer(
  text: string,
  deps: { backend: VaultBackend; resolver: SecretResolver },
  eol: "\n" | "\r\n",
): Promise<OpenResult> {
  const cache: SealCache = new Map();
  const file = fileVaultId(text);
  if (file) {
    const out = await decryptQuiet(text, deps.backend, deps.resolver);
    if (!out.ok) return { state: "no-secret" };
    const plain = out.plaintext.toString("utf8");
    cache.set("", {
      hash: hashText(plain, true),
      cipher: text,
      vaultId: file.vaultId,
    });
    return {
      state: "plain",
      text: `${markerComment(file.vaultId)}${eol}${plain}`,
      cache,
    };
  }
  const blocks = findVaultBlocks(text);
  if (!blocks.length) return { state: "nothing" };
  const edits: TextEdit[] = [];
  // #BUG-0009: every block runs decryptQuiet, which re-reads the sources (and re-runs password scripts) each time.
  for (const b of [...blocks].sort((a, c) => c.start - a.start)) {
    const dec = await decryptQuiet(b.ciphertext, deps.backend, deps.resolver);
    if (!dec.ok) return { state: "no-secret" };
    const plain = dec.plaintext.toString("utf8");
    cache.set(b.path, {
      hash: hashText(plain, true),
      cipher: b.ciphertext,
      vaultId: b.vaultId,
    });
    let scalar = formatScalar(plain, b.parentIndent, eol);
    const comment = ` ${markerComment(b.vaultId)}`;
    const nl = scalar.indexOf(eol);
    scalar = nl < 0 ? scalar + comment : scalar.slice(0, nl) + comment + scalar.slice(nl);
    edits.push({ start: b.start, end: b.end, newText: scalar });
  }
  return { state: "plain", text: applyTextEdits(text, edits), cache };
}
