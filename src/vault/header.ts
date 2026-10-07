// #AVE-0001: the one cheap parser for the ansible-vault header line; never touches the body.

export const VAULT_MAGIC = "$ANSIBLE_VAULT";

/** Label of the vault ID used when a vault carries none. */
// #AVE-0004
export const DEFAULT_LABEL = "default";

export interface VaultHeader {
  version: "1.1" | "1.2";
  cipher: string;
  /** Only 1.2 headers carry an ID; undefined for 1.1 or when the field is absent. */
  vaultId?: string;
  /** True when the field count matches the version (3 for 1.1, 4 for 1.2). */
  wellFormed: boolean;
}

/** True when the first line starts like a vault header (`$ANSIBLE_VAULT;`), valid or not. */
// #AVE-0012
export function hasVaultMagic(text: string): boolean {
  return firstLine(text).startsWith(`${VAULT_MAGIC};`);
}

function firstLine(text: string): string {
  return text.split(/\r?\n/, 1)[0].trim();
}

/** Parses only the first line (CRLF tolerant). Undefined if it is not a 1.1/1.2 vault header. */
// #AVE-0001, #AVE-0012
export function parseHeader(text: string): VaultHeader | undefined {
  const parts = firstLine(text).split(";");
  const [magic, version, cipher, vaultId] = parts;
  if (magic !== VAULT_MAGIC || (version !== "1.1" && version !== "1.2") || cipher === undefined) {
    return undefined;
  }
  return {
    version,
    cipher,
    vaultId: version === "1.2" && vaultId ? vaultId : undefined,
    wellFormed: version === "1.1" ? parts.length === 3 : parts.length === 4,
  };
}
