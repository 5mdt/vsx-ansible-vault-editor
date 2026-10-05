// #AVE-0005, #AVE-0006, #AVE-0012: small vscode helpers shared by commands and UI.

import * as vscode from "vscode";
import type { TextEdit } from "./inline/edits";

export const YAML_SELECTOR: vscode.DocumentSelector = [
  { language: "yaml" },
  { language: "ansible" },
];

// #AVE-0006
export function isYamlDocument(doc: vscode.TextDocument): boolean {
  return (
    doc.languageId === "yaml" ||
    doc.languageId === "ansible" ||
    /\.ya?ml$/i.test(doc.fileName)
  );
}

// #AVE-0001
export function eolOf(doc: vscode.TextDocument): "\n" | "\r\n" {
  return doc.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
}

function range(doc: vscode.TextDocument, edit: TextEdit): vscode.Range {
  return new vscode.Range(doc.positionAt(edit.start), doc.positionAt(edit.end));
}

export async function applyEdits(doc: vscode.TextDocument, edits: TextEdit[]): Promise<void> {
  const we = new vscode.WorkspaceEdit();
  for (const e of edits) we.replace(doc.uri, range(doc, e), e.newText);
  await vscode.workspace.applyEdit(we);
}

export async function replaceWholeDocument(doc: vscode.TextDocument, text: string): Promise<void> {
  await applyEdits(doc, [{ start: 0, end: doc.getText().length, newText: text }]);
}
