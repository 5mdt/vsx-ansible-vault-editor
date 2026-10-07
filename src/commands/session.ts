// #AVE-0004, #AVE-0005: choose the vault ID and secret once, then seal any number of texts.

import type { PickFn } from "../secrets/vault-ids";
import { chooseEncryptId, knownVaultIds, secretForEncrypt } from "../secrets/vault-ids";
import { DEFAULT_LABEL } from "../secrets/ansible-cfg";
import type { SecretResolver } from "../secrets/resolver";
import type { VaultBackend } from "../vault/backend";
import type { EncryptSession } from "../vault/seal";

export interface OpsDeps {
  backend: VaultBackend;
  resolver: SecretResolver;
  pick: PickFn;
  defaultVaultId?: string;
}

/** Undefined when the user cancelled the picker or the prompt. */
// #AVE-0004
export async function prepareEncrypt(deps: OpsDeps): Promise<EncryptSession | undefined> {
  const known = await knownVaultIds(deps.resolver, deps.defaultVaultId);
  const choice = await chooseEncryptId(known, deps.defaultVaultId, deps.pick);
  if (choice.cancelled) return undefined;
  const secret = await secretForEncrypt(deps.resolver, choice.vaultId ?? DEFAULT_LABEL);
  if (secret === undefined) return undefined;
  return { backend: deps.backend, vaultId: choice.vaultId, secret };
}
