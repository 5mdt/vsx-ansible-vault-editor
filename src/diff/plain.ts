// #AVE-0015: the plaintext reading view of a vaulted file or of a file with `!vault` blocks.

import { fileVaultId, findVaultBlocks } from "../detect";
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
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  if (fileVaultId(text)) {
    try {
      return (await decrypt(text)).plaintext.toString("utf8");
    } catch (e) {
      if (onFail === "throw") throw e;
      return text;
    }
  }
  let out = text;
  for (const b of [...findVaultBlocks(text)].sort((x, y) => y.start - x.start)) {
    try {
      const plain = (await decrypt(b.ciphertext)).plaintext.toString("utf8");
      out = out.slice(0, b.start) + formatScalar(plain, b.parentIndent, eol) + out.slice(b.end);
    } catch (e) {
      if (onFail === "throw") throw e;
    }
  }
  return out;
}
