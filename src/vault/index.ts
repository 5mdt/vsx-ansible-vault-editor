// #AVE-0002: picks the configured backend; the only vault module that touches vscode.

import * as vscode from "vscode";
import { CliBackend, CliNotFoundError, NativeBackend, type VaultBackend } from "./backend";

// #AVE-0002
export function getBackend(): VaultBackend {
  const cfg = vscode.workspace.getConfiguration("ansibleVault");
  if (cfg.get<string>("backend", "native") === "cli") {
    return new CliBackend(cfg.get<string>("cliPath", "ansible-vault"));
  }
  return new NativeBackend();
}

/** Offers the two actions for a missing CLI; returns true if the error was handled. */
// #AVE-0002
export async function handleBackendError(e: unknown): Promise<boolean> {
  if (!(e instanceof CliNotFoundError)) return false;
  const pick = await vscode.window.showErrorMessage(
    e.message,
    "Switch to native",
    "Open settings",
  );
  if (pick === "Switch to native") {
    await vscode.workspace
      .getConfiguration("ansibleVault")
      .update("backend", "native", vscode.ConfigurationTarget.Global);
  } else if (pick === "Open settings") {
    await vscode.commands.executeCommand(
      "workbench.action.openSettings",
      "ansibleVault.backend",
    );
  }
  return true;
}
