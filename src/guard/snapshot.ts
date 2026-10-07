// #AVE-0011: what a document was when it was opened, and whether saving it now is a leak.

import { fileVaultId, findVaultBlocks } from "../detect";
import { inlineTargets } from "../inline/yaml-values";
import { parseMarkers } from "../transparent/markers";

export interface Snapshot {
  file?: { vaultId?: string };
  blocks: Map<string, { vaultId?: string; ciphertext: string }>;
}

export type GuardReason = "was-vaulted" | "glob" | "marker";
export type GuardMode = "off" | "warn" | "block";
export type GuardAction = "save" | "dialog";

// #AVE-0011
export function snapshot(text: string): Snapshot {
  const file = fileVaultId(text);
  if (file) return { file, blocks: new Map() };
  const blocks = new Map<string, { vaultId?: string; ciphertext: string }>();
  for (const b of findVaultBlocks(text)) {
    blocks.set(b.path, { vaultId: b.vaultId, ciphertext: b.ciphertext });
  }
  return { blocks };
}

/** Why saving `text` as it is would write a secret in plaintext; empty when it would not. */
// #AVE-0011
export function guardReasons(text: string, snap: Snapshot, globMatch: boolean): GuardReason[] {
  const reasons: GuardReason[] = [];
  const vaulted = fileVaultId(text) !== undefined;
  const markers = parseMarkers(text);
  // A marked item is encrypted on save anyway; the marker is its own reason.
  if (!vaulted) {
    if (snap.file && !markers.file) reasons.push("was-vaulted");
    else if (snap.blocks.size && !markers.file) {
      const { targets, ok } = inlineTargets(text);
      const current = new Map(targets.map((t) => [t.path, t]));
      const marked = new Set(markers.values.map((m) => m.target.path));
      // A block that is no longer a vault block, and still exists, was decrypted.
      const decrypted = (p: string) => current.get(p) && !current.get(p)!.vault && !marked.has(p);
      if (ok && [...snap.blocks.keys()].some(decrypted)) reasons.push("was-vaulted");
    }
    if (globMatch && !markers.file) reasons.push("glob");
  }
  if (markers.file || markers.values.length) reasons.push("marker");
  return reasons;
}

// #AVE-0011
export function guardAction(reasons: GuardReason[], mode: GuardMode): GuardAction {
  return reasons.length && mode !== "off" ? "dialog" : "save";
}

/** The dialog's buttons; `block` has no "Save anyway". */
// #AVE-0011
export function guardButtons(mode: GuardMode): string[] {
  const all = ["Re-encrypt and save", "Save anyway"];
  return mode === "block" ? all.slice(0, 1) : all;
}

export type SaveDecision = "save" | "encrypt" | "dialog";

/** Transparent mode encrypts marked items silently; anything else guarded goes to the dialog. */
// #AVE-0011, #AVE-0013
export function decideSave(
  reasons: GuardReason[],
  mode: GuardMode,
  transparent: boolean,
): SaveDecision {
  if (!reasons.length) return "save";
  if (transparent && reasons.every((r) => r === "marker")) return "encrypt";
  return guardAction(reasons, mode);
}
