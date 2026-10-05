import * as vscode from "vscode";

// AVE-0014: command IDs come from package.json so the two cannot drift apart.
export function registerCommands(context: vscode.ExtensionContext): void {
  const commands: { command: string }[] =
    context.extension.packageJSON.contributes.commands;
  for (const { command } of commands) {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, () => {
        void vscode.window.showInformationMessage(`${command}: not implemented yet`);
      }),
    );
  }
}
