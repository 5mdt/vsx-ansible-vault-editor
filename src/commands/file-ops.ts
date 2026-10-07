// #AVE-0005: whole-file encrypt and decrypt as pure text operations.

import { fileVaultId } from "../detect";
import { RefusedError } from "../errors";
import { decryptWithSecrets } from "../secrets/vault-ids";
import { seal, type EncryptSession } from "../vault/seal";
import type { OpsDeps } from "./session";

export type FileOp = "encrypt" | "decrypt" | "toggle";
export type FilePlan = "encrypt" | "decrypt" | { refused: string };

// #AVE-0005
export function planFile(text: string, op: FileOp): FilePlan {
  const vaulted = fileVaultId(text) !== undefined;
  if (op === "toggle") return vaulted ? "decrypt" : "encrypt";
  if (op === "encrypt") return vaulted ? { refused: "already encrypted" } : "encrypt";
  return vaulted ? "decrypt" : { refused: "not encrypted" };
}

// #AVE-0005
export async function fileEncrypt(
  text: string,
  session: EncryptSession,
  eol: "\n" | "\r\n",
): Promise<string> {
  const plan = planFile(text, "encrypt");
  if (typeof plan === "object") throw new RefusedError(plan.refused);
  return seal(session, text, eol);
}

// #AVE-0005
export async function fileDecrypt(
  text: string,
  deps: Pick<OpsDeps, "backend" | "resolver">,
): Promise<string> {
  const plan = planFile(text, "decrypt");
  if (typeof plan === "object") throw new RefusedError(plan.refused);
  const out = await decryptWithSecrets(text, deps.backend, deps.resolver);
  return out.plaintext.toString("utf8");
}
