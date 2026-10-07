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
import { errorMessage, MAX_SCAN } from "../util";
import { eolOf, globMatch, isYamlDocument, readUtf8, replaceWholeDocument } from "../vscode-util";
import {
  decideSave,
  guardButtons,
  guardReasons,
  snapshot,
  type GuardMode,
  type Snapshot,
} from "./snapshot";
import {
  afterEncrypt,
  answerDialog,
  closeDialog,
  hold,
  initialFlags,
  openDialog,
  planStep,
  settleHeld,
  takeRestore,
  type GuardFlags,
} from "./state";

const AUTOSAVE_WARNED = "ansibleVault.autoSaveWarned";

interface DocState {
  snap: Snapshot;
  cache: SealCache;
  /** The transition flags; changed only through ./state (#AVE-0011). */
  flags: GuardFlags;
}

export interface GuardHandle {
  /** The buffer shows decrypted text of a file whose disk bytes are ciphertext. */
  isTransparent(doc: vscode.TextDocument): boolean;
  /** Writes rekeyed ciphertext through the document's own save, keeping unsaved edits. */
  writeRekeyed(doc: vscode.TextDocument, diskText: string): Promise<void>;
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
): GuardHandle {
  const states = new Map<string, DocState>();
  const key = (doc: vscode.TextDocument) => doc.uri.toString();
  const tracked = (doc: vscode.TextDocument) => doc.uri.scheme === "file";
  const stateOf = (doc: vscode.TextDocument): DocState => {
    let st = states.get(key(doc));
    if (!st) {
      st = { snap: snapshot(doc.getText()), cache: new Map(), flags: initialFlags() };
      states.set(key(doc), st);
    }
    return st;
  };
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
    // #BUG-0007: inlineTargets is memoized, so reasons and plan share one parse; `plain` skips the reasons.
    const text = doc.getText();
    const { mode, transparent, globs, defaultVaultId } = settings();
    const glob = globMatch(doc, globs);
    const step = planStep(st.flags, {
      text,
      mode,
      transparent,
      reasons: () => guardReasons(text, st.snap, glob),
    });
    st.flags = step.flags;
    if (step.kind === "write") return step.text;
    if (step.kind === "buffer") return undefined;
    warnAboutAutoSave();
    if (step.kind === "encrypt") {
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
          st.flags = afterEncrypt(st.flags, text, transparent);
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
          `Ansible Vault: ${errorMessage(e)}; nothing was written.`,
        );
      }
    }
    // Hold: write what is already on disk, ask afterwards.
    let disk = "";
    try {
      disk = await readUtf8(doc.uri);
    } catch {
      // a file that does not exist yet has nothing to preserve
    }
    st.flags = hold(st.flags, text, step.kind === "hold" ? step.decision : "encrypt");
    return disk;
  };

  const ask = async (doc: vscode.TextDocument, st: DocState) => {
    st.flags = openDialog(st.flags);
    try {
      const { mode } = settings();
      const buttons = guardButtons(mode);
      const pick = await vscode.window.showWarningMessage(
        `${path.basename(doc.fileName)} is about to be saved decrypted`,
        { modal: true },
        ...buttons,
      );
      const answer = answerDialog(st.flags, pick);
      st.flags = answer.flags;
      if (!answer.save) return;
      await doc.save();
    } finally {
      st.flags = closeDialog(st.flags);
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
      const restored = takeRestore(st.flags);
      st.flags = restored.flags;
      if (restored.text !== undefined) await replaceWholeDocument(doc, restored.text);
      const settled = settleHeld(st.flags);
      st.flags = settled.flags;
      if (settled.ask) void ask(doc, st);
    }),
  );
  for (const doc of vscode.workspace.textDocuments) void openTransparent(doc);

  return {
    isTransparent: (doc) => settings().transparent && (states.get(key(doc))?.cache.size ?? 0) > 0,
    // #AVE-0009
    async writeRekeyed(doc, diskText) {
      const st = stateOf(doc);
      st.snap = snapshot(diskText);
      const dec = await decryptForBuffer(diskText, { backend: getBackend(), resolver }, eolOf(doc));
      if (dec.state === "plain") st.cache = dec.cache;
      if (!doc.isDirty) {
        await vscode.workspace.fs.writeFile(doc.uri, Buffer.from(diskText, "utf8"));
        return;
      }
      st.flags = { ...st.flags, override: diskText };
      await doc.save();
    },
  };
}
