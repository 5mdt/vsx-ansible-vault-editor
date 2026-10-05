// #AVE-0011, #AVE-0013: the save guard and transparent mode, wired to VS Code documents.

import * as path from "node:path";
import * as vscode from "vscode";
import { fileVaultId } from "../detect";
import { DEFAULT_LABEL } from "../secrets/ansible-cfg";
import type { SecretResolver } from "../secrets/resolver";
import { secretForEncrypt } from "../secrets/vault-ids";
import { decryptForBuffer } from "../transparent/open";
import { planSave, type SealCache } from "../transparent/seal";
import { getBackend } from "../vault";
import { eolOf, isYamlDocument, replaceWholeDocument } from "../vscode-util";
import {
  decideSave,
  guardButtons,
  guardReasons,
  snapshot,
  type GuardMode,
  type Snapshot,
} from "./snapshot";

const MAX_SCAN = 1_000_000;
const AUTOSAVE_WARNED = "ansibleVault.autoSaveWarned";

interface DocState {
  snap: Snapshot;
  cache: SealCache;
  /** A dialog is open for this document. */
  pending: boolean;
  /** The dialog's answer, consumed by the next save. */
  allow?: "plain" | "encrypt";
  /** Plaintext to put back once the save has written safe bytes. */
  restore?: string;
  held: boolean;
}

function settings() {
  const cfg = vscode.workspace.getConfiguration("ansibleVault");
  return {
    mode: cfg.get<GuardMode>("saveGuard", "warn"),
    transparent: cfg.get<boolean>("transparent", false),
    globs: cfg.get<string[]>("mustEncryptGlobs", []),
    defaultVaultId: cfg.get<string>("defaultVaultId") || undefined,
  };
}

function wholeRange(doc: vscode.TextDocument): vscode.Range {
  return new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length));
}

// #AVE-0011
export function registerSaveGuard(
  context: vscode.ExtensionContext,
  resolver: SecretResolver,
  onTransparentOpen: () => void,
): void {
  const states = new Map<string, DocState>();
  const key = (doc: vscode.TextDocument) => doc.uri.toString();
  const tracked = (doc: vscode.TextDocument) => doc.uri.scheme === "file";
  const stateOf = (doc: vscode.TextDocument): DocState => {
    let st = states.get(key(doc));
    if (!st) {
      st = { snap: snapshot(doc.getText()), cache: new Map(), pending: false, held: false };
      states.set(key(doc), st);
    }
    return st;
  };
  const globMatch = (doc: vscode.TextDocument, globs: string[]) =>
    globs.some((pattern) => vscode.languages.match({ pattern }, doc) > 0);
  const secretFor = async (id: string | undefined) =>
    (await resolver.candidates(id ?? DEFAULT_LABEL))[0];

  const warnAboutAutoSave = () => {
    const mode = vscode.workspace.getConfiguration("files").get<string>("autoSave", "off");
    if (mode === "off" || context.globalState.get(AUTOSAVE_WARNED)) return;
    void context.globalState.update(AUTOSAVE_WARNED, true);
    void vscode.window.showWarningMessage(
      "Ansible Vault: with auto-save on, a guarded or transparent file is saved again after every save. The bytes stay identical; only the modification time changes.",
    );
  };

  const openTransparent = async (doc: vscode.TextDocument) => {
    if (!tracked(doc)) return;
    const text = doc.getText();
    if (text.length > MAX_SCAN || !(isYamlDocument(doc) || fileVaultId(text))) return;
    const st = stateOf(doc);
    st.snap = snapshot(text);
    if (!settings().transparent) return;
    const result = await decryptForBuffer(text, { backend: getBackend(), resolver }, eolOf(doc));
    if (result.state === "nothing") return;
    if (result.state === "no-secret") {
      void vscode.window
        .showInformationMessage(
          `Ansible Vault: no password for ${path.basename(doc.fileName)}; it stays encrypted.`,
          "Enter password",
        )
        .then(async (pick) => {
          if (pick !== "Enter password") return;
          const id = fileVaultId(text)?.vaultId ?? DEFAULT_LABEL;
          if ((await secretForEncrypt(resolver, id)) !== undefined && doc.getText() === text) {
            await openTransparent(doc);
          }
        });
      return;
    }
    if (doc.getText() !== text) return;
    st.cache = result.cache;
    await replaceWholeDocument(doc, result.text);
    onTransparentOpen();
    warnAboutAutoSave();
  };

  /** The text to write instead of the buffer, or undefined to write the buffer as it is. */
  const safeText = async (doc: vscode.TextDocument, st: DocState): Promise<string | undefined> => {
    const text = doc.getText();
    const { mode, transparent, globs, defaultVaultId } = settings();
    let decision: "save" | "encrypt" | "dialog";
    const glob = globMatch(doc, globs);
    const reasons = guardReasons(text, st.snap, glob);
    if (st.allow === "plain") {
      st.allow = undefined;
      return undefined;
    }
    if (st.allow === "encrypt") {
      st.allow = undefined;
      decision = reasons.length ? "encrypt" : "save";
    } else {
      decision = decideSave(reasons, mode, transparent);
    }
    if (decision === "save") return undefined;
    warnAboutAutoSave();
    if (decision === "encrypt") {
      try {
        const plan = await planSave(text, st.snap, glob, st.cache, {
          backend: getBackend(),
          defaultVaultId,
          secretFor,
          eol: eolOf(doc),
        });
        if (plan.ok) {
          st.cache = plan.cache;
          st.snap = snapshot(plan.newText);
          if (transparent) st.restore = text;
          return plan.newText;
        }
        void vscode.window
          .showErrorMessage(
            `Ansible Vault: no password to encrypt ${path.basename(doc.fileName)}; nothing was written.`,
            "Enter password",
          )
          .then((pick) => {
            if (pick === "Enter password") void secretForEncrypt(resolver, DEFAULT_LABEL);
          });
      } catch (e) {
        void vscode.window.showErrorMessage(
          `Ansible Vault: ${e instanceof Error ? e.message : String(e)}; nothing was written.`,
        );
      }
    }
    // Hold: write what is already on disk, ask afterwards.
    let disk = "";
    try {
      disk = Buffer.from(await vscode.workspace.fs.readFile(doc.uri)).toString("utf8");
    } catch {
      // a file that does not exist yet has nothing to preserve
    }
    st.restore = text;
    if (decision === "dialog") st.held = true;
    return disk;
  };

  const ask = async (doc: vscode.TextDocument, st: DocState) => {
    st.pending = true;
    try {
      const { mode } = settings();
      const buttons = guardButtons(mode);
      const pick = await vscode.window.showWarningMessage(
        `${path.basename(doc.fileName)} is about to be saved decrypted`,
        { modal: true },
        ...buttons,
      );
      if (pick === "Re-encrypt and save") st.allow = "encrypt";
      else if (pick === "Save anyway") st.allow = "plain";
      else return;
      await doc.save();
    } finally {
      st.pending = false;
    }
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => void openTransparent(doc)),
    vscode.workspace.onDidCloseTextDocument((doc) => void states.delete(key(doc))),
    vscode.workspace.onWillSaveTextDocument((e) => {
      if (!tracked(e.document) || e.document.getText().length > MAX_SCAN) return;
      const doc = e.document;
      const st = stateOf(doc);
      e.waitUntil(
        safeText(doc, st).then((text) =>
          text === undefined ? [] : [vscode.TextEdit.replace(wholeRange(doc), text)],
        ),
      );
    }),
    vscode.workspace.onDidSaveTextDocument(async (doc) => {
      const st = states.get(key(doc));
      if (!st) return;
      if (st.restore !== undefined) {
        const text = st.restore;
        st.restore = undefined;
        await replaceWholeDocument(doc, text);
      }
      if (st.held && !st.pending) {
        st.held = false;
        void ask(doc, st);
      } else if (st.held) {
        st.held = false;
      }
    }),
  );
  for (const doc of vscode.workspace.textDocuments) void openTransparent(doc);
}
