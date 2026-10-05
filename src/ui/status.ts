// #AVE-0012: status bar item, context keys, block decoration and folding.

import * as vscode from "vscode";
import { describeDocument, fileVaultId, findVaultBlocks, type DocumentState } from "../detect";
import { isYamlDocument, YAML_SELECTOR } from "../vscode-util";

const MAX_SCAN = 1_000_000;
const NOTHING: DocumentState = {
  fileIsVaulted: false,
  inVaultBlock: false,
  hasMarker: false,
};

// #AVE-0012
export function registerStatus(context: vscode.ExtensionContext): void {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = "ansibleVault.toggle";
  item.tooltip = "Ansible Vault: toggle encrypt/decrypt";
  const decoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(128, 128, 128, 0.12)",
  });
  context.subscriptions.push(item, decoration);

  const setKeys = (s: DocumentState) => {
    void vscode.commands.executeCommand("setContext", "ansibleVault.fileIsVaulted", s.fileIsVaulted);
    void vscode.commands.executeCommand("setContext", "ansibleVault.inVaultBlock", s.inVaultBlock);
    void vscode.commands.executeCommand("setContext", "ansibleVault.hasMarker", s.hasMarker);
  };

  const update = () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.getText().length > MAX_SCAN) {
      item.hide();
      setKeys(NOTHING);
      return;
    }
    const doc = editor.document;
    const text = doc.getText();
    const yaml = isYamlDocument(doc);
    const state =
      yaml || fileVaultId(text)
        ? describeDocument(text, doc.offsetAt(editor.selection.active))
        : NOTHING;
    setKeys(state);
    if (state.status) {
      item.text = state.status;
      item.show();
    } else {
      item.hide();
    }
    editor.setDecorations(
      decoration,
      yaml && !state.fileIsVaulted
        ? findVaultBlocks(text).map(
            (b) => new vscode.Range(doc.positionAt(b.start), doc.positionAt(b.end)),
          )
        : [],
    );
  };

  let timer: NodeJS.Timeout | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(update, 150);
  };
  context.subscriptions.push(
    new vscode.Disposable(() => clearTimeout(timer)),
    vscode.window.onDidChangeActiveTextEditor(update),
    vscode.window.onDidChangeTextEditorSelection(later),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) later();
    }),
    vscode.languages.registerFoldingRangeProvider(YAML_SELECTOR, {
      provideFoldingRanges(doc) {
        if (fileVaultId(doc.getText())) return [];
        return findVaultBlocks(doc.getText()).map(
          (b) =>
            new vscode.FoldingRange(
              doc.positionAt(b.start).line,
              doc.positionAt(b.end).line,
              vscode.FoldingRangeKind.Region,
            ),
        );
      },
    }),
  );
  update();
}
