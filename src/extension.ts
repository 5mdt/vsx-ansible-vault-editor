import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { createResolver } from "./secrets";

export function activate(context: vscode.ExtensionContext): void {
  const channel = vscode.window.createOutputChannel("Ansible Vault");
  context.subscriptions.push(channel);
  registerCommands(context, createResolver(context, channel));
}

export function deactivate(): void {}
