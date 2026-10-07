import * as path from "node:path";
import { detectEol, errorMessage, failureText } from "../util";
import * as vscode from "vscode";
import { fileVaultId, findVaultBlocks } from "../detect";
import { toggleMarkerEdit } from "../transparent/markers";
import type { DiffHandle } from "../diff";
import type { GuardHandle } from "../guard";
import { rekeyCommand, rekeyWorkspaceCommand } from "../rekey";
import { type DecryptedFs } from "../edit/provider";
import { peekExcluded, type PeekArg } from "../peek/hover";
import { peekTarget } from "../peek/peek";
import { RefusedError } from "../errors";
import { COMMAND_IDS, type CommandId } from "./ids";
import { decryptBlockEdit, encryptValueEdit, type TextEdit } from "../inline/edits";
import {
  inlineTargets,
  plainScalars,
  scalarAt,
  scalarInSelection,
  type ValueTarget,
} from "../inline/yaml-values";
import type { SecretResolver } from "../secrets/resolver";
import { pickVaultId } from "../secrets";
import { decryptWithSecrets } from "../secrets/vault-ids";
import { getBackend, handleBackendError } from "../vault";
import {
  applyEdits,
  eolOf,
  findOpenDocument,
  readUtf8,
  isYamlDocument,
  replaceWholeDocument,
} from "../vscode-util";
import { fileDecrypt, fileEncrypt, planFile, type FileOp } from "./file-ops";
import { prepareEncrypt, type OpsDeps } from "./session";

function opsDeps(resolver: SecretResolver): OpsDeps {
  const cfg = vscode.workspace.getConfiguration("ansibleVault");
  return {
    backend: getBackend(),
    resolver,
    pick: pickVaultId,
    defaultVaultId: cfg.get<string>("defaultVaultId") || undefined,
  };
}

async function guarded(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (await handleBackendError(e)) return;
    const message = errorMessage(e);
    void vscode.window.showErrorMessage(`Ansible Vault: ${message}`);
  }
}

type Where =
  { kind: "value" | "block"; target: ValueTarget } | { kind: "file" } | { kind: "bad-selection" };

/** What an editor command acts on: a value or block under the cursor, else the file. */
function whereAmI(editor: vscode.TextEditor): Where {
  const doc = editor.document;
  const text = doc.getText();
  if (!isYamlDocument(doc) || fileVaultId(text)) return { kind: "file" };
  const sel = editor.selection;
  const start = doc.offsetAt(sel.start);
  const target = sel.isEmpty
    ? scalarAt(text, start)
    : scalarInSelection(text, start, doc.offsetAt(sel.end));
  if (target) return { kind: target.vault ? "block" : "value", target };
  return sel.isEmpty ? { kind: "file" } : { kind: "bad-selection" };
}

/** Show collected per-item failures as one error message, if there are any. */
// #AVE-0005, #AVE-0006
function showFailures(failures: string[]): void {
  const text = failureText(failures);
  if (text) void vscode.window.showErrorMessage(text);
}

function activeEditor(): vscode.TextEditor {
  const editor = vscode.window.activeTextEditor;
  if (!editor) throw new RefusedError("open a file first");
  return editor;
}

async function encryptValue(editor: vscode.TextEditor, target: ValueTarget, deps: OpsDeps) {
  const session = await prepareEncrypt(deps);
  if (!session) return;
  const edit = await encryptValueEdit(target, session, eolOf(editor.document));
  await applyEdits(editor.document, [edit]);
}

async function decryptBlock(editor: vscode.TextEditor, target: ValueTarget, deps: OpsDeps) {
  const edit = await decryptBlockEdit(target, deps, eolOf(editor.document));
  await applyEdits(editor.document, [edit]);
}

// #AVE-0014
async function editorCommand(op: FileOp, resolver: SecretResolver): Promise<void> {
  const editor = activeEditor();
  const deps = opsDeps(resolver);
  const where = whereAmI(editor);
  if (where.kind === "bad-selection") {
    throw new RefusedError("selection must be inside a single value");
  }
  if (where.kind === "value") {
    if (op === "decrypt") throw new RefusedError("nothing to decrypt here");
    return encryptValue(editor, where.target, deps);
  }
  if (where.kind === "block") {
    if (op === "encrypt") throw new RefusedError("already encrypted");
    return decryptBlock(editor, where.target, deps);
  }
  if (op === "decrypt" && fileVaultId(editor.document.getText()) === undefined) {
    throw new RefusedError("nothing to decrypt here");
  }
  return fileCommand(op, [editor.document.uri], resolver);
}

function collectUris(args: unknown[]): vscode.Uri[] {
  const [first, many] = args;
  if (Array.isArray(many) && many.length) return many as vscode.Uri[];
  if (first instanceof vscode.Uri) return [first];
  const active = vscode.window.activeTextEditor?.document.uri;
  if (!active) throw new RefusedError("open a file first");
  return [active];
}

// #AVE-0005
async function fileCommand(op: FileOp, uris: vscode.Uri[], resolver: SecretResolver) {
  const deps = opsDeps(resolver);
  const failures: string[] = [];
  let session: Awaited<ReturnType<typeof prepareEncrypt>>;
  let asked = false;
  for (const uri of uris) {
    try {
      const open = findOpenDocument(uri);
      const text = open ? open.getText() : await readUtf8(uri);
      const plan = planFile(text, op);
      if (typeof plan === "object") throw new RefusedError(plan.refused);
      let out: string;
      if (plan === "encrypt") {
        if (!asked) {
          session = await prepareEncrypt(deps);
          asked = true;
        }
        if (!session) return;
        const eol = open ? eolOf(open) : detectEol(text);
        out = await fileEncrypt(text, session, eol);
      } else {
        out = await fileDecrypt(text, deps);
      }
      if (open) await replaceWholeDocument(open, out);
      else await vscode.workspace.fs.writeFile(uri, Buffer.from(out, "utf8"));
    } catch (e) {
      if (await handleBackendError(e)) return;
      failures.push(`${path.basename(uri.fsPath)}: ${errorMessage(e)}`);
    }
  }
  showFailures(failures);
}

// #AVE-0006
async function encryptAllInFile(resolver: SecretResolver): Promise<void> {
  const editor = activeEditor();
  const doc = editor.document;
  const text = doc.getText();
  if (!isYamlDocument(doc) || fileVaultId(text)) {
    throw new RefusedError("open a plain YAML file");
  }
  const targets = plainScalars(text);
  if (!targets.length) throw new RefusedError("no values to encrypt");
  // Keys only: never show the plaintext in the picker.
  const picked = await vscode.window.showQuickPick(
    targets.map((t, i) => ({ label: t.path || "(value)", index: i })),
    { canPickMany: true, title: "Values to encrypt" },
  );
  if (!picked?.length) return;
  const session = await prepareEncrypt(opsDeps(resolver));
  if (!session) return;
  const eol = eolOf(doc);
  const edits = await Promise.all(
    picked.map((p) => encryptValueEdit(targets[p.index], session, eol)),
  );
  await applyEdits(doc, edits);
}

// #AVE-0006
async function decryptAllInFile(resolver: SecretResolver): Promise<void> {
  const editor = activeEditor();
  const doc = editor.document;
  const text = doc.getText();
  const blocks = inlineTargets(text).ok && !fileVaultId(text) ? findVaultBlocks(text) : [];
  if (!blocks.length) throw new RefusedError("nothing to decrypt here");
  const deps = opsDeps(resolver);
  const edits: TextEdit[] = [];
  const failures: string[] = [];
  for (const b of blocks) {
    try {
      edits.push(await decryptBlockEdit(b, deps, eolOf(doc)));
    } catch (e) {
      if (await handleBackendError(e)) return;
      failures.push(`${b.path}: ${errorMessage(e)}`);
    }
  }
  if (edits.length) await applyEdits(doc, edits);
  showFailures(failures);
}

// #AVE-0007
async function peekCommand(resolver: SecretResolver, arg?: PeekArg): Promise<void> {
  let doc: vscode.TextDocument;
  let offset: number;
  if (arg?.uri) {
    doc = await vscode.workspace.openTextDocument(vscode.Uri.parse(arg.uri));
    offset = arg.offset;
  } else {
    const editor = activeEditor();
    doc = editor.document;
    offset = doc.offsetAt(editor.selection.active);
  }
  if (peekExcluded(doc))
    throw new RefusedError("peek is disabled for this file (ansibleVault.peekExclude)");
  const target = peekTarget(doc.getText(), offset);
  if (!target) throw new RefusedError("nothing to decrypt here");
  // An explicit command may prompt; the hover never does.
  const out = await decryptWithSecrets(target.ciphertext, getBackend(), resolver);
  const value = out.plaintext.toString("utf8");
  if (arg?.copy) {
    await vscode.env.clipboard.writeText(value);
    void vscode.window.showInformationMessage("Ansible Vault: copied");
    return;
  }
  const pick = await vscode.window.showInformationMessage(value, "Copy");
  if (pick === "Copy") await vscode.env.clipboard.writeText(value);
}

// #AVE-0013
async function toggleMarkerCommand(): Promise<void> {
  const editor = activeEditor();
  const doc = editor.document;
  const edit = toggleMarkerEdit(doc.getText(), doc.offsetAt(editor.selection.active), eolOf(doc));
  if (!edit) throw new RefusedError("no marker here");
  await applyEdits(doc, [edit]);
}

const HOT_EXIT_WARNED = "ansibleVault.hotExitWarned";

/** VS Code may back up unsaved edits of any document to disk; warn once (#AVE-0008). */
export function warnAboutHotExit(context: vscode.ExtensionContext): void {
  const hotExit = vscode.workspace.getConfiguration("files").get<string>("hotExit");
  if (hotExit === "off" || context.globalState.get(HOT_EXIT_WARNED)) return;
  void context.globalState.update(HOT_EXIT_WARNED, true);
  void vscode.window
    .showWarningMessage(
      "Ansible Vault: VS Code's hot exit can back up unsaved edits to disk, including decrypted text. Set files.hotExit to off to avoid it.",
      "Open settings",
    )
    .then((pick) => {
      if (pick === "Open settings") {
        void vscode.commands.executeCommand("workbench.action.openSettings", "files.hotExit");
      }
    });
}

// #AVE-0008
async function editDecryptedCommand(
  context: vscode.ExtensionContext,
  fs: DecryptedFs,
  arg?: PeekArg | vscode.Uri,
): Promise<void> {
  let source: vscode.Uri;
  let offset: number | undefined;
  if (arg instanceof vscode.Uri) {
    source = arg;
  } else if (arg?.uri) {
    source = vscode.Uri.parse(arg.uri);
    offset = arg.offset;
  } else {
    const editor = activeEditor();
    source = editor.document.uri;
    offset = editor.document.offsetAt(editor.selection.active);
  }
  const virtual = await fs.open(source, offset);
  warnAboutHotExit(context);
  // Not openTextDocument: that keeps an API reference alive for minutes after the tab closes,
  // and with it the plaintext. The editor service drops the model when the tab closes.
  await vscode.commands.executeCommand("vscode.open", virtual, {
    preview: false,
  });
}

// #AVE-0014, #AVE-0003, #AVE-0005, #AVE-0006, #AVE-0007, #AVE-0008, #AVE-0009, #AVE-0010, #AVE-0013, #AVE-0015
// Handlers are keyed by CommandId (exhaustive at compile time); a unit test pins COMMAND_IDS to package.json.
export function registerCommands(
  context: vscode.ExtensionContext,
  resolver: SecretResolver,
  editFs: DecryptedFs,
  guard: GuardHandle,
  diff: DiffHandle,
): void {
  const handlers: Record<CommandId, (...args: unknown[]) => Promise<void> | void> = {
    "ansibleVault.forgetPasswords": async () => {
      await resolver.forget();
      void vscode.window.showInformationMessage("Ansible Vault: cached passwords forgotten");
    },
    "ansibleVault.encrypt": () => guarded(() => editorCommand("encrypt", resolver)),
    "ansibleVault.decrypt": () => guarded(() => editorCommand("decrypt", resolver)),
    "ansibleVault.toggle": () => guarded(() => editorCommand("toggle", resolver)),
    "ansibleVault.encryptFile": (...a) =>
      guarded(async () => fileCommand("encrypt", collectUris(a), resolver)),
    "ansibleVault.decryptFile": (...a) =>
      guarded(async () => fileCommand("decrypt", collectUris(a), resolver)),
    "ansibleVault.toggleFile": (...a) =>
      guarded(async () => fileCommand("toggle", collectUris(a), resolver)),
    "ansibleVault.peek": (arg) => guarded(() => peekCommand(resolver, arg as PeekArg | undefined)),
    "ansibleVault.editDecrypted": (arg) =>
      guarded(() => editDecryptedCommand(context, editFs, arg as PeekArg | vscode.Uri | undefined)),
    "ansibleVault.rekey": () => guarded(() => rekeyCommand(resolver, guard)),
    "ansibleVault.rekeyWorkspace": () => guarded(() => rekeyWorkspaceCommand(resolver, guard)),
    "ansibleVault.openDecryptedChanges": (arg) => guarded(() => diff.open(arg, false)),
    "ansibleVault.openDecryptedStagedChanges": (arg) => guarded(() => diff.open(arg, true)),
    "ansibleVault.enableGitDiff": () => guarded(() => diff.enable()),
    "ansibleVault.disableGitDiff": () => guarded(() => diff.disable()),
    "ansibleVault.toggleMarker": () => guarded(toggleMarkerCommand),
    "ansibleVault.encryptAllInFile": () => guarded(() => encryptAllInFile(resolver)),
    "ansibleVault.decryptAllInFile": () => guarded(() => decryptAllInFile(resolver)),
  };
  for (const command of COMMAND_IDS) {
    context.subscriptions.push(vscode.commands.registerCommand(command, handlers[command]));
  }
}
