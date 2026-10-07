// #AVE-0006: turn a value or block into a text edit; no vscode types.

import type { EncryptSession, OpsDeps } from "../commands/session";
import { seal } from "../commands/session";
import { decryptWithSecrets } from "../secrets/vault-ids";
import { formatScalar, vaultBlockText, type ValueTarget } from "./yaml-values";

export interface TextEdit {
  start: number;
  end: number;
  newText: string;
}

/** The command does not apply here; the message is shown to the user as is. */
// #AVE-0005, #AVE-0006
// #BUG-0014: imported by seven modules from here; belongs in a shared errors module.
export class RefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefusedError";
  }
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
  target: ValueTarget,
  deps: Pick<OpsDeps, "backend" | "resolver">,
  eol: "\n" | "\r\n" = "\n",
): Promise<TextEdit> {
  if (!target.vault || target.ciphertext === undefined) {
    throw new RefusedError("not encrypted");
  }
  const out = await decryptWithSecrets(target.ciphertext, deps.backend, deps.resolver);
  return {
    start: target.start,
    end: target.end,
    newText: formatScalar(out.plaintext.toString("utf8"), target.parentIndent, eol),
  };
}
