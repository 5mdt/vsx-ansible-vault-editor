// #AVE-0011, #AVE-0013: turn a guarded plaintext buffer back into what may be written to disk.

import { hashText } from "../util";
import { seal } from "../vault/seal";
import { fileVaultId } from "../detect";
import { applyTextEdits, type TextEdit } from "../inline/edits";
import { inlineTargets, vaultBlockText } from "../inline/yaml-values";
import type { Snapshot } from "../guard/snapshot";
import type { VaultBackend } from "../vault/backend";
import { parseMarkers, stripFileMarker, type Markers } from "./markers";

export interface CacheEntry {
  hash: string;
  cipher: string;
  vaultId?: string;
}
/** Original ciphertext per item: "" is the whole file, otherwise the block's key path. */
export type SealCache = Map<string, CacheEntry>;

export interface SealDeps {
  backend: VaultBackend;
  defaultVaultId?: string;
  /** A secret for the ID without prompting; undefined when none is configured. */
  secretFor(vaultId: string | undefined): Promise<string | undefined>;
  eol: "\n" | "\r\n";
}

export type Plan =
  { ok: true; newText: string; cache: SealCache } | { ok: false; reason: "no-secret" };

class NoSecret extends Error {}

async function sealItem(
  key: string,
  plain: string,
  vaultId: string | undefined,
  deps: SealDeps,
  cache: SealCache,
  next: SealCache,
): Promise<string> {
  const hash = hashText(plain, true);
  const hit = cache.get(key);
  if (hit && hit.hash === hash && hit.vaultId === vaultId) {
    next.set(key, hit);
    return hit.cipher;
  }
  const secret = await deps.secretFor(vaultId);
  if (secret === undefined) throw new NoSecret();
  const cipher = await seal({ backend: deps.backend, vaultId, secret }, plain, deps.eol);
  next.set(key, { hash, cipher, vaultId });
  return cipher;
}

/** Whole file when it was a vaulted file, is marked as one, or must be encrypted and has no block history. */
// #AVE-0011, #BUG-0007
export function wholeFile(
  text: string,
  snap: Snapshot,
  globMatch: boolean,
  markers: Markers = parseMarkers(text),
): boolean {
  return !!snap.file || !!markers.file || (globMatch && snap.blocks.size === 0);
}

// #AVE-0011, #AVE-0013
export async function planSave(
  text: string,
  snap: Snapshot,
  globMatch: boolean,
  cache: SealCache,
  deps: SealDeps,
): Promise<Plan> {
  if (fileVaultId(text)) return { ok: true, newText: text, cache };
  const markers = parseMarkers(text);
  const next: SealCache = new Map();
  try {
    if (wholeFile(text, snap, globMatch, markers)) {
      const plain = markers.file ? stripFileMarker(text, markers.file) : text;
      const id = snap.file?.vaultId ?? markers.file?.vaultId ?? (deps.defaultVaultId || undefined);
      return {
        ok: true,
        newText: await sealItem("", plain, id, deps, cache, next),
        cache: next,
      };
    }
    const items = new Map<
      string,
      { start: number; end: number; plain: string; id?: string; indent: number }
    >();
    const { targets, ok } = inlineTargets(text);
    if (ok) {
      for (const t of targets) {
        const was = snap.blocks.get(t.path);
        if (!t.vault && was) {
          items.set(t.path, {
            start: t.start,
            end: t.end,
            plain: t.value,
            id: was.vaultId,
            indent: t.parentIndent,
          });
        }
      }
    }
    for (const m of markers.values) {
      const was = snap.blocks.get(m.target.path);
      items.set(m.target.path, {
        start: m.start,
        end: m.end,
        plain: m.target.value,
        id: was?.vaultId ?? m.vaultId ?? (deps.defaultVaultId || undefined),
        indent: m.target.parentIndent,
      });
    }
    const edits: TextEdit[] = [];
    for (const [path, it] of [...items].sort((a, b) => b[1].start - a[1].start)) {
      const cipher = await sealItem(path, it.plain, it.id, deps, cache, next);
      edits.push({
        start: it.start,
        end: it.end,
        newText: vaultBlockText(cipher, it.indent, deps.eol),
      });
    }
    return { ok: true, newText: applyTextEdits(text, edits), cache: next };
  } catch (e) {
    if (e instanceof NoSecret) return { ok: false, reason: "no-secret" };
    throw e;
  }
}
