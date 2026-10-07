// #AVE-0009, #AVE-0011, #AVE-0013: the save guard's per-document flags and their transitions, vscode-free.
//
// Every function takes the flags and returns the next flags (never mutates). The glue in
// index.ts does the I/O (reading disk, encrypting, dialogs) and applies what is returned.
//
// Known overlap, kept on purpose (no behavior change): `held` and `pending` both describe
// "a dialog is wanted / open". `held` is set by a save that wrote disk bytes back and still owes
// the user a question; `pending` is set while that question is open. `settleHeld` is where they
// meet: a held save that completes while a dialog is already open only clears `held` (no second
// dialog). Merging them would change that, so they stay separate.

import { decideSave, type GuardMode, type GuardReason, type SaveDecision } from "./snapshot";

export type Allow = "plain" | "encrypt";

export interface GuardFlags {
  /** A dialog is open for this document. */
  pending: boolean;
  /** The dialog's answer, consumed by the next save. */
  allow?: Allow;
  /** Plaintext to put back once the save has written safe bytes. */
  restore?: string;
  /** The last save wrote the disk bytes back; ask once it has completed. */
  held: boolean;
  /** Rekeyed disk text to write on the next save instead of the buffer (#AVE-0009). */
  override?: string;
}

// #AVE-0011
export function initialFlags(): GuardFlags {
  return { pending: false, held: false };
}

/** What `onWillSave` should do next; the glue performs it. */
export type SaveStep =
  /** Write `text` instead of the buffer; the buffer is restored afterwards. */
  | { kind: "write"; text: string; flags: GuardFlags }
  /** Write the buffer as it is. */
  | { kind: "buffer"; flags: GuardFlags }
  /** Try to encrypt; on success `afterEncrypt`, on failure `hold(.., "encrypt")`. */
  | { kind: "encrypt"; warn: true; flags: GuardFlags }
  /** Write the disk bytes back, restore the buffer and (for "dialog") ask afterwards. */
  | { kind: "hold"; warn: true; decision: "dialog"; flags: GuardFlags };

export interface SaveInput {
  text: string;
  mode: GuardMode;
  transparent: boolean;
  /** Computed lazily: `override` and `plain` never need it. */
  reasons: () => GuardReason[];
}

/** The order-dependent part of `safeText`, before any I/O. */
// #AVE-0009, #AVE-0011, #AVE-0013
export function planStep(flags: GuardFlags, input: SaveInput): SaveStep {
  if (flags.override !== undefined) {
    return {
      kind: "write",
      text: flags.override,
      flags: { ...flags, override: undefined, restore: input.text },
    };
  }
  if (flags.allow === "plain") return { kind: "buffer", flags: { ...flags, allow: undefined } };
  const reasons = input.reasons();
  let decision: SaveDecision;
  let next = flags;
  if (flags.allow === "encrypt") {
    next = { ...flags, allow: undefined };
    decision = reasons.length ? "encrypt" : "save";
  } else {
    decision = decideSave(reasons, input.mode, input.transparent);
  }
  if (decision === "save") return { kind: "buffer", flags: next };
  if (decision === "encrypt") return { kind: "encrypt", warn: true, flags: next };
  return { kind: "hold", warn: true, decision, flags: next };
}

/** Encryption succeeded: transparent mode shows the plaintext again after the save. */
// #AVE-0013
export function afterEncrypt(flags: GuardFlags, text: string, transparent: boolean): GuardFlags {
  return transparent ? { ...flags, restore: text } : flags;
}

/** Write the disk bytes back and put `text` back after; only a dialog hold owes a question. */
// #AVE-0011
export function hold(flags: GuardFlags, text: string, decision: SaveDecision): GuardFlags {
  return { ...flags, restore: text, held: decision === "dialog" ? true : flags.held };
}

/** After a save: the text to put back into the buffer, if any, and the flags without it. */
// #AVE-0011, #AVE-0013
export function takeRestore(flags: GuardFlags): { text?: string; flags: GuardFlags } {
  if (flags.restore === undefined) return { flags };
  return { text: flags.restore, flags: { ...flags, restore: undefined } };
}

/** After the restore: ask if a held save is waiting and no dialog is open; `held` clears either way. */
// #AVE-0011
export function settleHeld(flags: GuardFlags): { ask: boolean; flags: GuardFlags } {
  if (!flags.held) return { ask: false, flags };
  return { ask: !flags.pending, flags: { ...flags, held: false } };
}

// #AVE-0011
export function openDialog(flags: GuardFlags): GuardFlags {
  return { ...flags, pending: true };
}

// #AVE-0011
export function closeDialog(flags: GuardFlags): GuardFlags {
  return { ...flags, pending: false };
}

/** The dialog's answer: the next save's `allow` and whether to save now; no answer saves nothing. */
// #AVE-0011
export function answerDialog(
  flags: GuardFlags,
  pick: string | undefined,
): { save: boolean; flags: GuardFlags } {
  if (pick === "Re-encrypt and save") return { save: true, flags: { ...flags, allow: "encrypt" } };
  if (pick === "Save anyway") return { save: true, flags: { ...flags, allow: "plain" } };
  return { save: false, flags };
}
