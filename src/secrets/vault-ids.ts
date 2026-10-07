// #AVE-0004: choose the vault ID on encrypt, find the right secret on decrypt.

import type { VaultBackend } from "../vault/backend";
import { readHeader, VaultAuthError } from "../vault/format";
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

export interface Decrypted {
  plaintext: Buffer;
  vaultId?: string;
  /** The secret that worked; needed to re-encrypt (#AVE-0008). Never log it. */
  secret: string;
}

interface Attempt {
  found?: Decrypted;
  /** How many distinct secrets were tried. */
  tried: number;
}

/** Try every known secret without prompting: the ID's own first, then the rest. */
async function tryKnownSecrets(
  text: string,
  backend: VaultBackend,
  resolver: SecretResolver,
  id: string,
): Promise<Attempt> {
  // #BUG-0009: sources are read once per resolver snapshot, so looping over labels does not re-run scripts.
  const order = [id, ...(await resolver.labels()).filter((l) => l !== id)];
  const tried = new Set<string>();
  for (const label of order) {
    for (const secret of await resolver.candidates(label)) {
      if (tried.has(secret)) continue;
      tried.add(secret);
      try {
        const out = await backend.decrypt(text, secret);
        await resolver.confirm(label, secret);
        return { found: { ...out, secret }, tried: tried.size };
      } catch (e) {
        if (!(e instanceof VaultAuthError)) throw e;
        await resolver.reject(label, secret);
      }
    }
  }
  return { tried: tried.size };
}

// #AVE-0004
export async function decryptWithSecrets(
  text: string,
  backend: VaultBackend,
  resolver: SecretResolver,
): Promise<Decrypted> {
  const id = readHeader(text).vaultId ?? DEFAULT_LABEL;
  const attempt = await tryKnownSecrets(text, backend, resolver, id);
  if (attempt.found) return attempt.found;

  let mismatch = false;
  for (;;) {
    const secret = await resolver.promptFor(id, mismatch);
    if (secret === undefined) throw new NoSecretMatchedError();
    try {
      const out = await backend.decrypt(text, secret);
      await resolver.confirm(id, secret);
      return { ...out, secret };
    } catch (e) {
      if (!(e instanceof VaultAuthError)) throw e;
      await resolver.reject(id, secret);
      mismatch = true;
    }
  }
}

export type QuietResult = ({ ok: true } & Decrypted) | { ok: false; reason: "no-secret" | "wrong" };

/** Like decryptWithSecrets but never prompts: for hovers and other passive reads. */
// #AVE-0007
export async function decryptQuiet(
  text: string,
  backend: VaultBackend,
  resolver: SecretResolver,
): Promise<QuietResult> {
  const id = readHeader(text).vaultId ?? DEFAULT_LABEL;
  const attempt = await tryKnownSecrets(text, backend, resolver, id);
  if (attempt.found) return { ok: true, ...attempt.found };
  return { ok: false, reason: attempt.tried === 0 ? "no-secret" : "wrong" };
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
