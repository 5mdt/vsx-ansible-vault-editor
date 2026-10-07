// #AVE-0015: Open Decrypted Changes, and the opt-in `git diff` driver.

import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { RefusedError } from "../inline/edits";
import type { SecretResolver } from "../secrets/resolver";
import { decryptWithSecrets } from "../secrets/vault-ids";
import { getBackend } from "../vault";
import { CONFIG_KEYS, textconvCommand, withManagedAttributes, withoutManagedAttributes } from "./git-config";
import { hasVaulted, plainView } from "./plain";

const run = promisify(execFile);

export const DIFF_SCHEME = "ansible-vault-diff";

/** Plaintext served from memory; dropped when the tab closes. */
// #AVE-0015
export class DiffContent implements vscode.TextDocumentContentProvider, vscode.Disposable {
  private readonly texts = new Map<string, string>();
  private readonly closeListener: vscode.Disposable;

  constructor() {
    this.closeListener = vscode.workspace.onDidCloseTextDocument((doc) => {
      if (doc.uri.scheme === DIFF_SCHEME) this.texts.delete(doc.uri.toString());
    });
  }

  put(uri: vscode.Uri, text: string): void {
    this.texts.set(uri.toString(), text);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.texts.get(uri.toString()) ?? "";
  }

  dispose(): void {
    this.closeListener.dispose();
    this.texts.clear();
  }
}

interface GitRepository {
  rootUri: vscode.Uri;
  show(ref: string, filePath: string): Promise<string>;
}
interface GitApi {
  getRepository(uri: vscode.Uri): GitRepository | null;
}

async function gitApi(): Promise<GitApi | undefined> {
  const ext = vscode.extensions.getExtension<{ getAPI(v: 1): GitApi }>("vscode.git");
  if (!ext) return undefined;
  try {
    const exports = ext.isActive ? ext.exports : await ext.activate();
    return exports.getAPI(1);
  } catch {
    return undefined;
  }
}

interface Target {
  file: vscode.Uri;
  staged: boolean;
}

/** An SCM resource state, a file or `git:` URI, or the active editor. */
function targetOf(arg: unknown, staged: boolean): Target {
  let uri: vscode.Uri | undefined;
  if (arg instanceof vscode.Uri) uri = arg;
  else if (arg && typeof arg === "object" && (arg as { resourceUri?: unknown }).resourceUri instanceof vscode.Uri) {
    uri = (arg as { resourceUri: vscode.Uri }).resourceUri;
  } else uri = vscode.window.activeTextEditor?.document.uri;
  if (!uri) throw new RefusedError("open a file first");
  // The right-hand side of a staged diff is the index: a `git:` URI naming the real file.
  if (uri.scheme === "git") {
    try {
      const q = JSON.parse(uri.query) as { path?: string };
      if (q.path) return { file: vscode.Uri.file(q.path), staged: true };
    } catch {
      // fall through
    }
  }
  return { file: uri, staged };
}

const showOrEmpty = (repo: GitRepository, ref: string, file: string) =>
  repo.show(ref, file).catch(() => "");

async function folderFor(): Promise<vscode.WorkspaceFolder> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) throw new RefusedError("open a folder first");
  if (folders.length === 1) return folders[0];
  const pick = await vscode.window.showWorkspaceFolderPick({ placeHolder: "Repository" });
  if (!pick) throw new RefusedError("cancelled");
  return pick;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  try {
    return (await run("git", args, { cwd })).stdout.trim();
  } catch (e) {
    throw new RefusedError(`git failed: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`);
  }
}

function shimPath(context: vscode.ExtensionContext): string {
  return path.join(context.globalStorageUri.fsPath, "textconv.js");
}

async function installShim(context: vscode.ExtensionContext): Promise<string> {
  const target = shimPath(context);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(context.extensionPath, "build", "textconv.js"), target);
  return target;
}

export interface DiffHandle {
  open(arg: unknown, staged: boolean): Promise<void>;
  enable(): Promise<void>;
  disable(): Promise<void>;
}

// #AVE-0015
export function registerDiff(context: vscode.ExtensionContext, resolver: SecretResolver): DiffHandle {
  const content = new DiffContent();
  let counter = 0;
  context.subscriptions.push(
    content,
    vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, content),
  );
  // The configured command points at this copy, so keep it as current as the extension.
  if (existsSync(shimPath(context))) void installShim(context).catch(() => {});

  const attributesFile = async (cwd: string) =>
    path.resolve(cwd, await git(cwd, "rev-parse", "--git-path", "info/attributes"));

  return {
    async open(arg, staged) {
      const target = targetOf(arg, staged);
      const api = await gitApi();
      if (!api) throw new RefusedError("the built-in Git extension is not available");
      const repo = api.getRepository(target.file);
      if (!repo) throw new RefusedError("this file is not in a Git repository");
      const file = target.file.fsPath;
      const [before, after] = target.staged
        ? [await showOrEmpty(repo, "HEAD", file), await showOrEmpty(repo, "", file)]
        : [
            await showOrEmpty(repo, "", file),
            Buffer.from(await vscode.workspace.fs.readFile(target.file)).toString("utf8"),
          ];
      if (!hasVaulted(before) && !hasVaulted(after)) throw new RefusedError("nothing to decrypt in this change");
      if (before === after) throw new RefusedError("no changes to show");
      const backend = getBackend();
      const decrypt = (c: string) => decryptWithSecrets(c, backend, resolver);
      const name = path.basename(file);
      const n = ++counter;
      const left = vscode.Uri.from({ scheme: DIFF_SCHEME, path: `/${name}`, query: `side=before&n=${n}` });
      const right = vscode.Uri.from({ scheme: DIFF_SCHEME, path: `/${name}`, query: `side=after&n=${n}` });
      content.put(left, await plainView(before, decrypt, "throw"));
      content.put(right, await plainView(after, decrypt, "throw"));
      await vscode.commands.executeCommand("vscode.diff", left, right, `${name} (decrypted)`);
    },

    async enable() {
      const folder = await folderFor();
      const cwd = folder.uri.fsPath;
      const attrs = await attributesFile(cwd);
      // #BUG-0008: async so the extension host stays responsive.
      try {
        await run("node", ["--version"]);
      } catch {
        throw new RefusedError("the git driver needs `node` on the PATH");
      }
      const pick = await vscode.window.showWarningMessage(
        "Show decrypted content in `git diff` for this repository?",
        {
          modal: true,
          detail:
            "This writes the repository's local git config and .git/info/attributes (nothing tracked). Plaintext will appear in git diff output, which can end up in terminal scrollback and logs. Secrets come from the password file or ansible.cfg only; there is no prompt.",
        },
        "Enable",
      );
      if (pick !== "Enable") return;
      const cfg = vscode.workspace.getConfiguration("ansibleVault");
      const configured = cfg.get<string>("passwordFile") || undefined;
      const passwordFile = configured && path.resolve(cwd, configured);
      const shim = await installShim(context);
      await git(cwd, "config", "--local", CONFIG_KEYS.textconv, textconvCommand(shim, passwordFile));
      await git(cwd, "config", "--local", CONFIG_KEYS.cache, "false");
      const globs = cfg.get<string[]>("diffGlobs", ["*.yml", "*.yaml", "*.vault"]);
      const before = existsSync(attrs) ? await readFile(attrs, "utf8") : "";
      await mkdir(path.dirname(attrs), { recursive: true });
      await writeFile(attrs, withManagedAttributes(before, globs));
      void vscode.window.showInformationMessage("Ansible Vault: git diff now shows decrypted content in this repository");
    },

    async disable() {
      const folder = await folderFor();
      const cwd = folder.uri.fsPath;
      const attrs = await attributesFile(cwd);
      for (const key of [CONFIG_KEYS.textconv, CONFIG_KEYS.cache]) {
        // exit code 5 just means the key was not set
        await run("git", ["config", "--local", "--unset-all", key], { cwd }).catch(() => {});
      }
      if (existsSync(attrs)) {
        await writeFile(attrs, withoutManagedAttributes(await readFile(attrs, "utf8")));
      }
      void vscode.window.showInformationMessage("Ansible Vault: git diff no longer decrypts in this repository");
    },
  };
}
