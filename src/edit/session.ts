// #AVE-0008: edit a vaulted file or block in memory; pure text in, text out.

import { createHash } from "node:crypto";
import { seal } from "../commands/session";
import { fileVaultId } from "../detect";
import { RefusedError } from "../inline/edits";
import { inlineTargets, scalarAt, vaultBlockText } from "../inline/yaml-values";
import type { SecretResolver } from "../secrets/resolver";
import { decryptWithSecrets } from "../secrets/vault-ids";
import type { VaultBackend } from "../vault/backend";

export interface EditDeps {
  backend: VaultBackend;
  resolver: SecretResolver;
}

/** Everything needed to save an edit later. Holds the secret: drop it on close. */
export interface EditSession {
  kind: "file" | "block";
  plaintext: Buffer;
  vaultId?: string;
  secret: string;
  sourceHash: string;
  /** Block mode: the key path used to find the block again at save. */
  path?: string;
  eol: "\n" | "\r\n";
}

export type SaveResult =
  | { conflict: false; newSourceText: string; newSourceHash: string }
  | { conflict: true; reason: "changed" };

// #AVE-0008
export function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// #AVE-0008
export async function openEdit(
  text: string,
  offset: number | undefined,
  deps: EditDeps,
): Promise<EditSession> {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  let ciphertext: string;
  let kind: "file" | "block";
  let path: string | undefined;
  if (fileVaultId(text)) {
    kind = "file";
    ciphertext = text;
  } else {
    const target = offset === undefined ? undefined : scalarAt(text, offset);
    if (!target?.vault || target.ciphertext === undefined) {
      throw new RefusedError("nothing to decrypt here");
    }
    kind = "block";
    ciphertext = target.ciphertext;
    path = target.path;
  }
  const out = await decryptWithSecrets(ciphertext, deps.backend, deps.resolver);
  return {
    kind,
    plaintext: out.plaintext,
    vaultId: out.vaultId,
    secret: out.secret,
    sourceHash: hashText(text),
    path,
    eol,
  };
}

/** Re-encrypts `newPlaintext` into a new source text; the caller writes it. */
// #AVE-0008
export async function saveEdit(
  session: EditSession,
  newPlaintext: Buffer | string,
  currentSource: string,
  deps: Pick<EditDeps, "backend">,
  opts: { overwrite?: boolean } = {},
): Promise<SaveResult> {
  if (!opts.overwrite && hashText(currentSource) !== session.sourceHash) {
    return { conflict: true, reason: "changed" };
  }
  const cipher = await seal(
    { backend: deps.backend, vaultId: session.vaultId, secret: session.secret },
    newPlaintext,
    session.eol,
  );
  let newSourceText: string;
  if (session.kind === "file") {
    newSourceText = cipher;
  } else {
    const { targets, ok } = inlineTargets(currentSource);
    const block = ok ? targets.find((t) => t.vault && t.path === session.path) : undefined;
    if (!block) throw new RefusedError(`block "${session.path}" no longer exists in the source`);
    newSourceText =
      // #BUG-0011: reverse-sorted splice, copy-pasted five times; one applyTextEdits would do.
      currentSource.slice(0, block.start) +
      vaultBlockText(cipher, block.parentIndent, session.eol) +
      currentSource.slice(block.end);
  }
  return { conflict: false, newSourceText, newSourceHash: hashText(newSourceText) };
}
