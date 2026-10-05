// #AVE-0005, #AVE-0006, #AVE-0012: small vscode helpers shared by commands and UI.

import * as vscode from "vscode";

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
