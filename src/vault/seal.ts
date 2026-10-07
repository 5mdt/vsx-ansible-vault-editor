// #AVE-0005: encrypt one text with an already chosen vault ID and secret.

import type { VaultBackend } from "./backend";

// #AVE-0005
export interface EncryptSession {
  backend: VaultBackend;
  vaultId?: string;
  secret: string;
}

// #AVE-0005
export function seal(
  session: EncryptSession,
  plain: Buffer | string,
  eol: "\n" | "\r\n",
): Promise<string> {
  return session.backend.encrypt(plain, session.secret, {
    vaultId: session.vaultId,
    eol,
  });
}
