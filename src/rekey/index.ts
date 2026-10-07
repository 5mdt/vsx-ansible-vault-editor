// #AVE-0009, #AVE-0010: the rekey commands.

import { open as fsOpen } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { GuardHandle } from "../guard";
import { RefusedError } from "../inline/edits";
import { pickRekeyId, promptNewPassword } from "../secrets";
import { DEFAULT_LABEL } from "../secrets/ansible-cfg";
import type { SecretResolver } from "../secrets/resolver";
import { decryptQuiet, decryptWithSecrets, knownVaultIds } from "../secrets/vault-ids";
import { getBackend } from "../vault";
import { replaceWholeDocument } from "../vscode-util";
import { itemsIn, rekeyMany, rekeyText, selectBlocks, type RekeyDeps } from "./rekey";
import { excludeGlob, filterById, idCounts, looksBinary, mapLimit, previewTitle, scanText, type ScanEntry } from "./scan";

// #BUG-0013: MAX_SCAN is defined in four files.
const MAX_SCAN = 1_000_000;

const readDisk = async (uri: vscode.Uri) =>
  Buffer.from(await vscode.workspace.fs.readFile(uri)).toString("utf8");

/** The ID to rekey to and the new secret; undefined when the user cancelled. */
async function chooseTarget(resolver: SecretResolver) {
  const defaultVaultId = vscode.workspace.getConfiguration("ansibleVault").get<string>("defaultVaultId") || undefined;
  const picked = await pickRekeyId(await knownVaultIds(resolver, defaultVaultId), defaultVaultId);
  if (!picked) return undefined;
  const label = picked.vaultId ?? DEFAULT_LABEL;
  const secret = await promptNewPassword(label);
  if (secret === undefined) return undefined;
  return { vaultId: picked.vaultId, label, secret };
}

function warnIfConfigured(resolver: SecretResolver, label: string): void {
  if (resolver.hasSourceFor(label)) {
    void vscode.window.showWarningMessage(
      `Ansible Vault: "${label}" is still supplied by a password file or environment variable; update it to the new password.`,
    );
  }
}

// #AVE-0009
export async function rekeyCommand(resolver: SecretResolver, guard: GuardHandle): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) throw new RefusedError("open a file first");
  const doc = editor.document;
  const transparent = guard.isTransparent(doc);
  const text = transparent ? await readDisk(doc.uri) : doc.getText();
  if (itemsIn(text).kind === "none") throw new RefusedError("nothing to rekey here");

  const target = await chooseTarget(resolver);
  if (!target) return;
  const backend = getBackend();
  const sel = editor.selection;
  const deps: RekeyDeps = { backend, decrypt: (c) => decryptWithSecrets(c, backend, resolver) };
  // #BUG-0016, #BUG-0018: the ternary on vaultId equals { vaultId, secret }; lines like this are about 190 characters.
  const out = await rekeyText(text, target.vaultId === undefined ? { secret: target.secret } : { vaultId: target.vaultId, secret: target.secret }, deps, {
    // Offsets of a decrypted buffer do not match the disk text: take every block.
    blocks: transparent ? undefined : (all) => selectBlocks(all, doc.offsetAt(sel.start), doc.offsetAt(sel.end)),
  });
  await resolver.replace(target.label, target.secret, false);
  if (transparent) await guard.writeRekeyed(doc, out.text);
  else await replaceWholeDocument(doc, out.text);
  void vscode.window.showInformationMessage(`Ansible Vault: rekeyed ${out.count} ${out.count === 1 ? "item" : "items"}`);
  warnIfConfigured(resolver, target.label);
}

interface Found {
  uri: vscode.Uri;
  text: string;
  entry: ScanEntry;
  open?: vscode.TextDocument;
  transparent: boolean;
}

const idLabel = (id: string) => (id === "" ? "(no ID)" : id);

const SCAN_CONCURRENCY = 8;
const PREFIX_BYTES = 4096;

/** The first bytes of a closed file; undefined when it cannot be read cheaply (non-file scheme). #BUG-0010 */
async function readPrefix(uri: vscode.Uri): Promise<Uint8Array | undefined> {
  if (uri.scheme !== "file") return undefined;
  const fh = await fsOpen(uri.fsPath, "r");
  try {
    const buf = Buffer.alloc(PREFIX_BYTES);
    const { bytesRead } = await fh.read(buf, 0, PREFIX_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

// #BUG-0010, #AVE-0010
async function scanWorkspace(guard: GuardHandle): Promise<Found[]> {
  const exclude = excludeGlob(
    vscode.workspace.getConfiguration("files").get<Record<string, boolean>>("exclude", {}),
    vscode.workspace.getConfiguration("ansibleVault").get<string[]>("rekeyExclude", []),
  );
  const uris = await vscode.workspace.findFiles("**/*", exclude);
  const openDocs = new Map(vscode.workspace.textDocuments.map((d) => [d.uri.toString(), d]));
  const results = await mapLimit(uris, SCAN_CONCURRENCY, async (uri): Promise<Found | undefined> => {
    try {
      const open = openDocs.get(uri.toString());
      const transparent = open ? guard.isTransparent(open) : false;
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > MAX_SCAN) return undefined;
      let text: string;
      if (open && !transparent) text = open.getText();
      else {
        const prefix = open ? undefined : await readPrefix(uri);
        if (prefix && looksBinary(prefix)) return undefined;
        text = await readDisk(uri);
      }
      if (!text.includes("$ANSIBLE_VAULT;")) return undefined;
      const entry = scanText(text);
      return entry ? { uri, text, entry, open, transparent } : undefined;
    } catch {
      // unreadable or binary: not ours
      return undefined;
    }
  });
  return results.filter((f): f is Found => f !== undefined);
}

// #AVE-0010
export async function rekeyWorkspaceCommand(resolver: SecretResolver, guard: GuardHandle): Promise<void> {
  const all = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: "Ansible Vault: scanning" },
    () => scanWorkspace(guard),
  );
  if (!all.length) throw new RefusedError("no vaulted files in the workspace");

  let idFilter: string | undefined;
  const counts = idCounts(all.map((f) => f.entry));
  if (counts.size > 1) {
    const choice = await vscode.window.showQuickPick(
      [{ label: "All vault IDs" }, ...[...counts].map(([id, n]) => ({ label: idLabel(id), description: `${n} files`, id }))],
      { title: "Rekey which vault ID?" },
    );
    if (!choice) return;
    idFilter = "id" in choice ? choice.id : undefined;
  }
  const shown = filterById(all, idFilter);
  const rel = (f: Found) => vscode.workspace.asRelativePath(f.uri);
  const picked = await vscode.window.showQuickPick(
    shown.map((f) => ({
      label: rel(f),
      description: f.entry.kind === "file" ? "file" : `${f.entry.count} blocks`,
      picked: true,
      found: f,
    })),
    { canPickMany: true, title: previewTitle(shown.map((f) => f.entry)), placeHolder: "Untick files to skip, Enter to rekey" },
  );
  if (!picked?.length) return;
  const chosen = picked.map((p) => p.found);

  const target = await chooseTarget(resolver);
  if (!target) return;
  const backend = getBackend();
  // One prompt per source ID nothing can answer for; the run itself never prompts.
  for (const id of new Set(chosen.flatMap((f) => f.entry.vaultIds))) {
    const label = id || DEFAULT_LABEL;
    if ((await resolver.candidates(label)).length === 0 && (await resolver.promptFor(label, false)) === undefined) return;
  }
  const deps: RekeyDeps = {
    backend,
    async decrypt(c) {
      const r = await decryptQuiet(c, backend, resolver);
      if (!r.ok) throw new Error(r.reason === "no-secret" ? "no secret for it" : "no known password opens it");
      return r;
    },
  };
  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Ansible Vault: rekeying", cancellable: true },
    (progress, token) =>
      rekeyMany(
        chosen.map((f) => ({ id: f.uri.toString(), text: f.text })),
        target.vaultId === undefined ? { secret: target.secret } : { vaultId: target.vaultId, secret: target.secret },
        deps,
        { idFilter, cancelled: () => token.isCancellationRequested, onFile: (id) => progress.report({ message: path.basename(vscode.Uri.parse(id).fsPath) }) },
      ),
  );
  if (result.cancelled) {
    void vscode.window.showInformationMessage("Ansible Vault: rekey cancelled, nothing changed");
    return;
  }

  await resolver.replace(target.label, target.secret, true);
  const byId = new Map(chosen.map((f) => [f.uri.toString(), f]));
  const edit = new vscode.WorkspaceEdit();
  const saveAfter: vscode.TextDocument[] = [];
  const unsaved: string[] = [];
  const failed = result.failed.map((f) => `${path.basename(vscode.Uri.parse(f.id).fsPath)}: ${f.reason}`);
  for (const a of result.applied) {
    const f = byId.get(a.id)!;
    try {
      if (f.open && f.transparent) await guard.writeRekeyed(f.open, a.text);
      else if (f.open) {
        edit.replace(f.uri, new vscode.Range(f.open.positionAt(0), f.open.positionAt(f.open.getText().length)), a.text);
        if (f.open.isDirty) unsaved.push(rel(f));
        else saveAfter.push(f.open);
      } else await vscode.workspace.fs.writeFile(f.uri, Buffer.from(a.text, "utf8"));
    } catch (e) {
      failed.push(`${rel(f)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  await vscode.workspace.applyEdit(edit);
  for (const d of saveAfter) await d.save();

  const items = result.applied.reduce((n, a) => n + a.count, 0);
  void vscode.window.showInformationMessage(
    `Ansible Vault: rekeyed ${items} items in ${result.applied.length} files` + (unsaved.length ? `; left unsaved: ${unsaved.join(", ")}` : ""),
  );
  if (failed.length) void vscode.window.showWarningMessage(`Ansible Vault: not rekeyed: ${failed.join("; ")}`);
  warnIfConfigured(resolver, target.label);
}
