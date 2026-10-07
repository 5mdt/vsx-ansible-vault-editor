// #AVE-0006: lightbulb actions on a scalar or a !vault block.

import * as vscode from "vscode";
import { fileVaultId } from "../detect";
import { YAML_SELECTOR } from "../vscode-util";
import { scalarAt } from "./yaml-values";

// #AVE-0006
export function registerCodeActions(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      YAML_SELECTOR,
      {
        provideCodeActions(doc, range) {
          // #BUG-0007: scalarAt reuses the memoized parse.
          const text = doc.getText();
          if (fileVaultId(text)) return [];
          const target = scalarAt(text, doc.offsetAt(range.start));
          if (!target) return [];
          const action = new vscode.CodeAction(
            target.vault ? "Decrypt value" : "Encrypt value",
            vscode.CodeActionKind.RefactorRewrite,
          );
          action.command = {
            title: action.title,
            command: target.vault ? "ansibleVault.decrypt" : "ansibleVault.encrypt",
          };
          return [action];
        },
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.RefactorRewrite] },
    ),
  );
}
