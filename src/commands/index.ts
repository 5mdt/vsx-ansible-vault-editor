import * as vscode from "vscode";
import type { SecretResolver } from "../secrets/resolver";

// AVE-0014: command IDs come from package.json so the two cannot drift apart.
// #AVE-0003: forgetPasswords is real; the rest stay stubs until their epics.
export function registerCommands(
  context: vscode.ExtensionContext,
  resolver: SecretResolver,
): void {
  const handlers: Record<string, () => Promise<void> | void> = {
    "ansibleVault.forgetPasswords": async () => {
      await resolver.forget();
      void vscode.window.showInformationMessage("Ansible Vault: cached passwords forgotten");
    },
  };
  const commands: { command: string }[] =
    context.extension.packageJSON.contributes.commands;
  for (const { command } of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        command,
        handlers[command] ??
          (() => {
            void vscode.window.showInformationMessage(`${command}: not implemented yet`);
          }),
      ),
    );
  }
}
