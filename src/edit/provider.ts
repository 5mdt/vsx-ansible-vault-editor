// #AVE-0008: ansible-vault: virtual documents. The plaintext lives only in this map.

import { findOpenDocument, readUtf8 } from "../vscode-util";
import * as path from "node:path";
import * as vscode from "vscode";
import { RefusedError } from "../errors";
import { inlineTargets } from "../inline/yaml-values";
import { openEdit, saveEdit, type EditDeps, type EditSession } from "./session";

export const SCHEME = "ansible-vault";

interface Entry {
  session: EditSession;
  source: vscode.Uri;
  content: Uint8Array;
  mtime: number;
}

const decode = (b: Uint8Array) => Buffer.from(b).toString("utf8");

const readText = readUtf8;

function openDirtyDocument(uri: vscode.Uri): vscode.TextDocument | undefined {
  return findOpenDocument(uri, { dirtyOnly: true });
}

// #AVE-0008
export class DecryptedFs implements vscode.FileSystemProvider, vscode.Disposable {
  private readonly entries = new Map<string, Entry>();
  private readonly emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.emitter.event;
  private readonly closeListener: vscode.Disposable;

  constructor(private readonly deps: () => EditDeps) {
    // Closing the tab drops the plaintext and the secret.
    this.closeListener = vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.uri.scheme === SCHEME) this.entries.delete(doc.uri.toString());
    });
  }

  dispose(): void {
    this.closeListener.dispose();
    this.entries.clear();
  }

  /** Decrypts `source` (a vaulted file, or the block at `offset`) and returns the virtual URI. */
  async open(source: vscode.Uri, offset: number | undefined): Promise<vscode.Uri> {
    if (openDirtyDocument(source)) throw new RefusedError("save the file first");
    const text = await readText(source);
    const session = await openEdit(text, offset, this.deps());
    const name =
      session.kind === "file"
        ? path.basename(source.path)
        : `${path.basename(source.path)}.${(session.path ?? "value").replace(/[^\w.-]/g, "_")}.txt`;
    const params = new URLSearchParams({ src: source.toString() });
    if (session.path) params.set("block", session.path);
    const uri = vscode.Uri.from({
      scheme: SCHEME,
      path: `/${name}`,
      query: params.toString(),
    });
    this.entries.set(uri.toString(), {
      session,
      source,
      content: session.plaintext,
      mtime: Date.now(),
    });
    return uri;
  }

  private entry(uri: vscode.Uri): Entry {
    const e = this.entries.get(uri.toString());
    if (!e) throw vscode.FileSystemError.FileNotFound(uri);
    return e;
  }

  watch(): vscode.Disposable {
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    if (uri.path === "/") return { type: vscode.FileType.Directory, ctime: 0, mtime: 0, size: 0 };
    const e = this.entry(uri);
    return {
      type: vscode.FileType.File,
      ctime: 0,
      mtime: e.mtime,
      size: e.content.length,
    };
  }

  readDirectory(): [string, vscode.FileType][] {
    return [];
  }

  readFile(uri: vscode.Uri): Uint8Array {
    return this.entry(uri).content;
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    const e = this.entry(uri);
    if (openDirtyDocument(e.source)) throw new RefusedError("save the source file first");
    const plain = Buffer.from(content);
    const deps = this.deps();
    const current = await readText(e.source);
    let result = await saveEdit(e.session, plain, current, deps);
    if (result.conflict) {
      const choice = await vscode.window.showWarningMessage(
        `${path.basename(e.source.path)} changed on disk since it was opened.`,
        { modal: true },
        "Overwrite",
        "Reload",
      );
      if (choice === "Reload") {
        await this.reload(uri, e, current);
        throw vscode.FileSystemError.Unavailable("reloaded from disk; re-apply your edits");
      }
      if (choice !== "Overwrite") throw vscode.FileSystemError.Unavailable("save cancelled");
      result = await saveEdit(e.session, plain, current, deps, {
        overwrite: true,
      });
    }
    if (result.conflict) throw vscode.FileSystemError.Unavailable("save cancelled");
    await vscode.workspace.fs.writeFile(e.source, Buffer.from(result.newSourceText, "utf8"));
    e.session.sourceHash = result.newSourceHash;
    e.session.plaintext = plain;
    e.content = content;
    e.mtime = Date.now();
    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
  }

  /** Re-read the source and replace this entry's content, then revert the tab to it. */
  private async reload(uri: vscode.Uri, e: Entry, current: string): Promise<void> {
    let offset: number | undefined;
    if (e.session.kind === "block") {
      const block = inlineTargets(current).targets.find(
        (t) => t.vault && t.path === e.session.path,
      );
      if (!block)
        throw new RefusedError(`block "${e.session.path}" no longer exists in the source`);
      offset = block.start;
    }
    const session = await openEdit(current, offset, this.deps());
    e.session = session;
    e.content = session.plaintext;
    e.mtime = Date.now();
    this.emitter.fire([{ type: vscode.FileChangeType.Changed, uri }]);
    if (vscode.window.activeTextEditor?.document.uri.toString() === uri.toString()) {
      await vscode.commands.executeCommand("workbench.action.files.revert");
    }
  }

  createDirectory(): void {
    throw vscode.FileSystemError.NoPermissions("read-only namespace");
  }

  delete(): void {
    throw vscode.FileSystemError.NoPermissions("read-only namespace");
  }

  rename(): void {
    throw vscode.FileSystemError.NoPermissions("read-only namespace");
  }
}
