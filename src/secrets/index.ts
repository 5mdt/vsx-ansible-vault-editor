// #AVE-0003, #AVE-0004: the vscode side of secrets (keychain, prompt, picker).

import { homedir } from "node:os";
import * as vscode from "vscode";
import { SecretResolver, type PromptFn, type SecretStore } from "./resolver";
import type { PickFn } from "./vault-ids";

const INDEX_KEY = "ansibleVault.rememberedKeys";
const NO_ID_LABEL = "(no ID, vault 1.1 header)";

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** SecretStorage keyed by workspace and vault ID, with an index so Forget can find them. */
// #AVE-0003
export function secretStore(context: vscode.ExtensionContext): SecretStore {
  const prefix = `ansibleVault/${workspaceRoot() ?? ""}/`;
  const indexed = () => context.globalState.get<string[]>(INDEX_KEY, []);
  return {
    get: async (id) => context.secrets.get(prefix + id),
    set: async (id, secret) => {
      await context.secrets.store(prefix + id, secret);
      const keys = indexed();
      if (!keys.includes(prefix + id)) {
        await context.globalState.update(INDEX_KEY, [...keys, prefix + id]);
      }
    },
    delete: async (id) => {
      await context.secrets.delete(prefix + id);
      await context.globalState.update(
        INDEX_KEY,
        indexed().filter((k) => k !== prefix + id),
      );
    },
    ids: async () =>
      indexed()
        .filter((k) => k.startsWith(prefix))
        .map((k) => k.slice(prefix.length)),
  };
}

// #AVE-0003
export const promptForPassword: PromptFn = (vaultId, mismatch) =>
  new Promise((resolve) => {
    const box = vscode.window.createInputBox();
    const remember: vscode.QuickInputButton = {
      iconPath: new vscode.ThemeIcon("key"),
      tooltip: "Remember in keychain",
    };
    let done = false;
    const finish = (value: { secret: string; remember: boolean } | undefined) => {
      if (done) return;
      done = true;
      resolve(value);
      box.dispose();
    };
    box.title = `Vault password for "${vaultId}"`;
    box.prompt = "Enter to use once, or the key button to remember in keychain";
    box.password = true;
    box.buttons = [remember];
    if (mismatch) box.validationMessage = "does not match";
    box.onDidAccept(() => {
      if (box.value !== "") finish({ secret: box.value, remember: false });
    });
    box.onDidTriggerButton(() => {
      if (box.value !== "") finish({ secret: box.value, remember: true });
    });
    box.onDidHide(() => finish(undefined));
    box.show();
  });

// #AVE-0004
export const pickVaultId: PickFn = async (ids, defaultId) => {
  const items: vscode.QuickPickItem[] = [
    ...ids.map((id) => ({ label: id, description: id === defaultId ? "(default)" : "" })),
    { label: NO_ID_LABEL },
  ];
  const pick = await vscode.window.showQuickPick(
    // default first so it is pre-selected
    items.sort((a, b) => Number(b.description !== "") - Number(a.description !== "")),
    { title: "Select vault ID" },
  );
  if (!pick) return undefined;
  return pick.label === NO_ID_LABEL ? null : pick.label;
};

// #AVE-0003
export function createResolver(
  context: vscode.ExtensionContext,
  channel: vscode.OutputChannel,
): SecretResolver {
  return new SecretResolver({
    get passwordFile() {
      return (
        vscode.workspace.getConfiguration("ansibleVault").get<string>("passwordFile") ||
        undefined
      );
    },
    env: process.env,
    get workspaceRoot() {
      return workspaceRoot();
    },
    home: homedir(),
    get trusted() {
      return vscode.workspace.isTrusted;
    },
    store: secretStore(context),
    prompt: promptForPassword,
    report: (m) => channel.appendLine(m),
  });
}
