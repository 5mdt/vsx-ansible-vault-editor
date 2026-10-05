// #AVE-0004: choose the vault ID on encrypt, find the right secret on decrypt.

import type { VaultBackend } from "../vault/backend";
import { parseEnvelope, VaultAuthError } from "../vault/format";
import { DEFAULT_LABEL } from "./ansible-cfg";
import type { SecretResolver } from "./resolver";

/** Every candidate failed and the prompt was cancelled. */
// #AVE-0004
export class NoSecretMatchedError extends Error {
  constructor() {
    super("no secret matched");
    this.name = "NoSecretMatchedError";
  }
}

/** string = chosen ID, null = "no ID", undefined = cancelled. */
export type PickFn = (
  ids: string[],
  defaultId: string | undefined,
) => Promise<string | null | undefined>;

export type EncryptChoice = { cancelled: false; vaultId?: string } | { cancelled: true };

// #AVE-0004
export async function knownVaultIds(
  resolver: SecretResolver,
  defaultVaultId: string | undefined,
): Promise<string[]> {
  const ids = (await resolver.labels()).filter((l) => l !== DEFAULT_LABEL);
  if (defaultVaultId && !ids.includes(defaultVaultId)) ids.unshift(defaultVaultId);
  return ids;
}

// #AVE-0004
export async function chooseEncryptId(
  known: string[],
  defaultVaultId: string | undefined,
  pick: PickFn,
): Promise<EncryptChoice> {
  if (known.length === 0) return { cancelled: false, vaultId: defaultVaultId || undefined };
  if (known.length === 1) return { cancelled: false, vaultId: known[0] };
  const choice = await pick(known, defaultVaultId);
  if (choice === undefined) return { cancelled: true };
  return { cancelled: false, vaultId: choice ?? undefined };
}

// #AVE-0004
export async function decryptWithSecrets(
  text: string,
  backend: VaultBackend,
  resolver: SecretResolver,
): Promise<{ plaintext: Buffer; vaultId?: string }> {
  const id = parseEnvelope(text).vaultId ?? DEFAULT_LABEL;
  const order = [id, ...(await resolver.labels()).filter((l) => l !== id)];
  const tried = new Set<string>();

  for (const label of order) {
    for (const secret of await resolver.candidates(label)) {
      if (tried.has(secret)) continue;
      tried.add(secret);
      try {
        const out = await backend.decrypt(text, secret);
        await resolver.confirm(label, secret);
        return out;
      } catch (e) {
        if (!(e instanceof VaultAuthError)) throw e;
        await resolver.reject(label, secret);
      }
    }
  }

  let mismatch = false;
  for (;;) {
    const secret = await resolver.promptFor(id, mismatch);
    if (secret === undefined) throw new NoSecretMatchedError();
    try {
      const out = await backend.decrypt(text, secret);
      await resolver.confirm(id, secret);
      return out;
    } catch (e) {
      if (!(e instanceof VaultAuthError)) throw e;
      await resolver.reject(id, secret);
      mismatch = true;
    }
  }
}

/** The secret to encrypt with: configured first, else prompt. Remembered right away if asked. */
// #AVE-0004
export async function secretForEncrypt(
  resolver: SecretResolver,
  vaultId: string,
): Promise<string | undefined> {
  const [first] = await resolver.candidates(vaultId);
  if (first !== undefined) return first;
  const typed = await resolver.promptFor(vaultId, false);
  if (typed !== undefined) await resolver.confirm(vaultId, typed);
  return typed;
}
