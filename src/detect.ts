// #AVE-0012: local detection of vaulted files and inline blocks; never needs a password.

import { inlineTargets, type ValueTarget } from "./inline/yaml-values";
import { hasVaultMagic, parseHeader } from "./vault/header";
import { parseMarkers, type Markers } from "./transparent/markers";

export interface VaultBlock {
  start: number;
  end: number;
  vaultId?: string;
  ciphertext: string;
  parentIndent: number;
  path: string;
}

// #AVE-0012
export function fileVaultId(text: string): { vaultId?: string } | undefined {
  if (!hasVaultMagic(text)) return undefined;
  return { vaultId: parseHeader(text)?.vaultId };
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
  /** The document carries an `ansible-vault: encrypt` marker (#AVE-0013). */
  hasMarker: boolean;
  /** Status bar text, undefined when nothing is vaulted. */
  status?: string;
  /** The blocks and markers found while describing; undefined for a vaulted file (#BUG-0007). */
  blocks?: VaultBlock[];
  markers?: Markers;
}

// #AVE-0012, #BUG-0007
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
  const markers = parseMarkers(text);
  return {
    fileIsVaulted: false,
    inVaultBlock: blockAt(blocks, offset) !== undefined,
    hasMarker: !!markers.file || markers.values.length > 0,
    status: blocks.length ? `🔒 ${blocks.length} inline` : undefined,
    blocks,
    markers,
  };
}
