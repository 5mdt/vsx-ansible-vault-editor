// #AVE-0012: status bar item, context keys, block decoration and folding.

import * as vscode from "vscode";
import { parseMarkers } from "../transparent/markers";
import { describeDocument, fileVaultId, findVaultBlocks, type DocumentState } from "../detect";
import { isYamlDocument, YAML_SELECTOR } from "../vscode-util";

// #BUG-0013: MAX_SCAN is defined in four files.
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
  const lock =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill="#888" d="M5 7V5a3 3 0 016 0v2h1v7H4V7zm1.5 0h3V5a1.5 1.5 0 00-3 0z"/></svg>',
    );
  // #AVE-0013: marker comments are dimmed and get a lock in the gutter.
  const markerDecoration = vscode.window.createTextEditorDecorationType({
    opacity: "0.5",
    gutterIconPath: vscode.Uri.parse(lock),
    gutterIconSize: "contain",
  });
  context.subscriptions.push(item, decoration, markerDecoration);

  const setKeys = (s: DocumentState) => {
    void vscode.commands.executeCommand("setContext", "ansibleVault.fileIsVaulted", s.fileIsVaulted);
    void vscode.commands.executeCommand("setContext", "ansibleVault.inVaultBlock", s.inVaultBlock);
    void vscode.commands.executeCommand("setContext", "ansibleVault.hasMarker", s.hasMarker);
  };

  const update = () => {
    // #BUG-0007: up to four full YAML parses per cursor move (describeDocument, findVaultBlocks, parseMarkers, plus the providers).
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
    const markers = yaml ? parseMarkers(text) : { values: [] };
    const ranges = markers.values.map(
      (m) => new vscode.Range(doc.positionAt(m.commentStart), doc.positionAt(m.commentEnd)),
    );
    if ("file" in markers && markers.file) {
      ranges.push(doc.lineAt(0).range);
    }
    editor.setDecorations(markerDecoration, ranges);
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
