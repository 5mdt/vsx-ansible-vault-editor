import * as vscode from "vscode";
import { registerCommands, warnAboutHotExit } from "./commands";
import { registerSaveGuard } from "./guard";
import { DecryptedFs, SCHEME } from "./edit/provider";
import { registerCodeActions } from "./inline/code-actions";
import { createCodeLensProvider, createHoverProvider } from "./peek/hover";
import { createResolver } from "./secrets";
import { registerStatus } from "./ui/status";
import { getBackend } from "./vault";
import { YAML_SELECTOR } from "./vscode-util";

export function activate(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel("Ansible Vault");
  context.subscriptions.push(channel);
  const resolver = createResolver(context, channel);
  const deps = () => ({ backend: getBackend(), resolver });

  const editFs = new DecryptedFs(deps);
  context.subscriptions.push(
    editFs,
    vscode.workspace.registerFileSystemProvider(SCHEME, editFs, { isCaseSensitive: true }),
    vscode.languages.registerHoverProvider(
      [{ scheme: "file" }, { scheme: "untitled" }],
      createHoverProvider(deps),
    ),
    vscode.languages.registerCodeLensProvider(YAML_SELECTOR, createCodeLensProvider()),
  );

  registerCommands(context, resolver, editFs);
  registerSaveGuard(context, resolver, () => warnAboutHotExit(context));
  registerStatus(context);
  registerCodeActions(context);
}

export function deactivate(): void {}
