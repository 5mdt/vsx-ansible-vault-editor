import * as vscode from "vscode";

const COMMANDS = [
  "ansibleVault.toggle",
  "ansibleVault.toggleFile",
  "ansibleVault.peek",
  "ansibleVault.editDecrypted",
  "ansibleVault.rekey",
  "ansibleVault.rekeyWorkspace",
  "ansibleVault.forgetPasswords",
];

export function registerCommands(context: vscode.ExtensionContext): void {
  for (const id of COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(id, () => {
        void vscode.window.showInformationMessage(`${id}: not implemented yet`);
      }),
    );
  }
}
