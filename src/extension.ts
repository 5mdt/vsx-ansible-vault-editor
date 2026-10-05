import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { registerCodeActions } from "./inline/code-actions";
import { createResolver } from "./secrets";
import { registerStatus } from "./ui/status";

export function activate(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel("Ansible Vault");
  context.subscriptions.push(channel);
  registerCommands(context, createResolver(context, channel));
  registerStatus(context);
  registerCodeActions(context);
}

export function deactivate(): void {}
