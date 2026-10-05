// #AVE-0009: rekey a document's vaulted file or blocks in memory; pure text in, text out.

import { fileVaultId, findVaultBlocks, type VaultBlock } from "../detect";
import { vaultBlockText } from "../inline/yaml-values";
import { seal } from "../commands/session";
import type { Decrypted } from "../secrets/vault-ids";
import type { VaultBackend } from "../vault/backend";

export type Items =
  | { kind: "file"; vaultId?: string }
  | { kind: "blocks"; blocks: VaultBlock[] }
  | { kind: "none" };

export interface RekeyTarget {
  /** Undefined writes a 1.1 header without an ID. */
  vaultId?: string;
  secret: string;
}

export interface RekeyDeps {
  backend: VaultBackend;
  /** Opens one ciphertext; throws when no secret works. */
  decrypt(ciphertext: string): Promise<Decrypted>;
}

// #AVE-0009
export function itemsIn(text: string): Items {
  const file = fileVaultId(text);
  if (file) return { kind: "file", vaultId: file.vaultId };
  const blocks = findVaultBlocks(text);
  return blocks.length ? { kind: "blocks", blocks } : { kind: "none" };
}

/** Blocks touched by the selection; every block when it touches none. */
// #AVE-0009
export function selectBlocks(blocks: VaultBlock[], start: number, end: number): VaultBlock[] {
  const hit = blocks.filter((b) => start <= b.end && end >= b.start);
  return hit.length ? hit : blocks;
}

export interface RekeyResult {
  text: string;
  count: number;
}

/** All-or-nothing: decrypts everything first and throws before any text is produced. */
// #AVE-0009
export async function rekeyText(
  text: string,
  target: RekeyTarget,
  deps: RekeyDeps,
  opts: { blocks?: (all: VaultBlock[]) => VaultBlock[]; eol?: "\n" | "\r\n" } = {},
): Promise<RekeyResult> {
  const eol = opts.eol ?? (text.includes("\r\n") ? "\r\n" : "\n");
  const session = { backend: deps.backend, vaultId: target.vaultId, secret: target.secret };
  const items = itemsIn(text);
  if (items.kind === "none") return { text, count: 0 };
  if (items.kind === "file") {
    const old = await deps.decrypt(text);
    return { text: await seal(session, old.plaintext, eol), count: 1 };
  }
  const chosen = opts.blocks ? opts.blocks(items.blocks) : items.blocks;
  const plains: Buffer[] = [];
  for (const b of chosen) plains.push((await deps.decrypt(b.ciphertext)).plaintext);
  const sealed: string[] = [];
  for (const p of plains) sealed.push(await seal(session, p, eol));
  let out = text;
  chosen
    .map((b, i) => ({ b, cipher: sealed[i] }))
    .sort((x, y) => y.b.start - x.b.start)
    .forEach(({ b, cipher }) => {
      out = out.slice(0, b.start) + vaultBlockText(cipher, b.parentIndent, eol) + out.slice(b.end);
    });
  return { text: out, count: chosen.length };
}

export interface FileInput {
  id: string;
  text: string;
}

export interface WorkspaceResult {
  applied: { id: string; text: string; count: number }[];
  failed: { id: string; reason: string }[];
  cancelled: boolean;
}

/** Per-file atomicity: a file that fails is listed and left out; cancelling applies nothing. */
// #AVE-0010
export async function rekeyMany(
  files: FileInput[],
  target: RekeyTarget,
  deps: RekeyDeps,
  opts: { idFilter?: string; cancelled?: () => boolean; onFile?: (id: string) => void } = {},
): Promise<WorkspaceResult> {
  const result: WorkspaceResult = { applied: [], failed: [], cancelled: false };
  for (const f of files) {
    if (opts.cancelled?.()) return { applied: [], failed: result.failed, cancelled: true };
    opts.onFile?.(f.id);
    try {
      const only = opts.idFilter;
      const items = itemsIn(f.text);
      if (only !== undefined && items.kind === "file" && (items.vaultId ?? "") !== only) continue;
      const out = await rekeyText(f.text, target, deps, {
        blocks: only === undefined ? undefined : (all) => all.filter((b) => (b.vaultId ?? "") === only),
      });
      if (out.count) result.applied.push({ id: f.id, text: out.text, count: out.count });
    } catch (e) {
      result.failed.push({ id: f.id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return result;
}
