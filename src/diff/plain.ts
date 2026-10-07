// #AVE-0015: the plaintext reading view of a vaulted file or of a file with `!vault` blocks.

import { detectEol } from "../util";
import { fileVaultId, findVaultBlocks } from "../detect";
import { applyTextEdits, type TextEdit } from "../inline/edits";
import { formatScalar } from "../inline/yaml-values";

export type DecryptFn = (ciphertext: string) => Promise<{ plaintext: Buffer }>;

/** True when there is anything in `text` for `plainView` to decrypt. */
// #AVE-0015
export function hasVaulted(text: string): boolean {
  return fileVaultId(text) !== undefined || findVaultBlocks(text).length > 0;
}

/**
 * A vaulted file becomes its plaintext; otherwise every `!vault` block is replaced by its value.
 * `keep` leaves an item that cannot be decrypted as it was; `throw` fails the whole view.
 */
// #AVE-0015
export async function plainView(
  text: string,
  decrypt: DecryptFn,
  onFail: "throw" | "keep",
): Promise<string> {
  const eol = detectEol(text);
  if (fileVaultId(text)) {
    try {
      return (await decrypt(text)).plaintext.toString("utf8");
    } catch (e) {
      if (onFail === "throw") throw e;
      return text;
    }
  }
  const edits: TextEdit[] = [];
  for (const b of [...findVaultBlocks(text)].sort((x, y) => y.start - x.start)) {
    try {
      const plain = (await decrypt(b.ciphertext)).plaintext.toString("utf8");
      edits.push({
        start: b.start,
        end: b.end,
        newText: formatScalar(plain, b.parentIndent, eol),
      });
    } catch (e) {
      if (onFail === "throw") throw e;
    }
  }
  return applyTextEdits(text, edits);
}
