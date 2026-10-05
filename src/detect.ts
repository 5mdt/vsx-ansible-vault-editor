// #AVE-0012: local detection of vaulted files and inline blocks; never needs a password.

import { inlineTargets, type ValueTarget } from "./inline/yaml-values";

export interface VaultBlock {
  start: number;
  end: number;
  vaultId?: string;
  ciphertext: string;
  parentIndent: number;
  path: string;
}

const HEADER = /^\$ANSIBLE_VAULT;1\.[12];AES256(?:;(.*))?$/;

// #AVE-0012
export function fileVaultId(text: string): { vaultId?: string } | undefined {
  const first = text.split(/\r?\n/, 1)[0].trim();
  if (!first.startsWith("$ANSIBLE_VAULT;")) return undefined;
  const m = HEADER.exec(first);
  return { vaultId: m?.[1] || undefined };
}

function toBlock(t: ValueTarget): VaultBlock {
  return {
    start: t.start,
    end: t.end,
    vaultId: t.vaultId,
    ciphertext: t.ciphertext ?? "",
    parentIndent: t.parentIndent,
    path: t.path,
  };
}

// #AVE-0012
export function findVaultBlocks(text: string): VaultBlock[] {
  return inlineTargets(text)
    .targets.filter((t) => t.vault)
    .map(toBlock);
}

// #AVE-0012
export function blockAt(blocks: VaultBlock[], offset: number): VaultBlock | undefined {
  return blocks.find((b) => offset >= b.start && offset <= b.end);
}

export interface DocumentState {
  fileIsVaulted: boolean;
  inVaultBlock: boolean;
  /** Always false until transparent mode (#AVE-0013). */
  hasMarker: boolean;
  /** Status bar text, undefined when nothing is vaulted. */
  status?: string;
}

// #AVE-0012
export function describeDocument(text: string, offset: number): DocumentState {
  const file = fileVaultId(text);
  if (file) {
    return {
      fileIsVaulted: true,
      inVaultBlock: false,
      hasMarker: false,
      status: `🔒 ${file.vaultId ?? "vault"}`,
    };
  }
  const blocks = findVaultBlocks(text);
  return {
    fileIsVaulted: false,
    inVaultBlock: blockAt(blocks, offset) !== undefined,
    hasMarker: false,
    status: blocks.length ? `🔒 ${blocks.length} inline` : undefined,
  };
}
