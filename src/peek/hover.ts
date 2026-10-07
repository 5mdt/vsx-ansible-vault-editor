// #AVE-0007: hover and CodeLens for vaulted values. Read-only; never prompts on its own.

import { MAX_SCAN } from "../util";
import * as vscode from "vscode";
import { fileVaultId } from "../detect";
import type { EditDeps } from "../edit/session";
import { inlineTargets } from "../inline/yaml-values";
import { globMatch, isYamlDocument } from "../vscode-util";
import { hoverMarkdown, peekQuiet } from "./peek";

/** Arguments of `ansibleVault.peek` and `ansibleVault.editDecrypted` links. */
export interface PeekArg {
  uri: string;
  offset: number;
  copy?: boolean;
}

// #AVE-0007
export function peekExcluded(doc: vscode.TextDocument): boolean {
  return globMatch(
    doc,
    vscode.workspace.getConfiguration("ansibleVault").get<string[]>("peekExclude", []),
  );
}

function link(title: string, command: string, arg: PeekArg): string {
  return `[${title}](command:${command}?${encodeURIComponent(JSON.stringify([arg]))})`;
}

// #AVE-0007
export function createHoverProvider(deps: () => EditDeps): vscode.HoverProvider {
  return {
    async provideHover(doc, position) {
      const cfg = vscode.workspace.getConfiguration("ansibleVault");
      if (!cfg.get<boolean>("hover.enabled", true) || peekExcluded(doc)) return undefined;
      const text = doc.getText();
      if (text.length > MAX_SCAN || !(isYamlDocument(doc) || fileVaultId(text))) return undefined;

      const offset = doc.offsetAt(position);
      const result = await peekQuiet(text, offset, deps(), { headerOnly: true });
      if (!result) return undefined;
      const target = result.state === "ok" ? result.target : undefined;

      const md = new vscode.MarkdownString();
      md.isTrusted = { enabledCommands: ["ansibleVault.peek", "ansibleVault.editDecrypted"] };
      const arg: PeekArg = { uri: doc.uri.toString(), offset };
      if (result.state === "ok") {
        md.appendMarkdown(hoverMarkdown(result.plaintext));
        md.appendMarkdown(
          `\n\n${link("Copy", "ansibleVault.peek", { ...arg, copy: true })} | ${link("Edit decrypted", "ansibleVault.editDecrypted", arg)}`,
        );
      } else if (result.state === "no-secret") {
        md.appendMarkdown(link("Enter password", "ansibleVault.peek", arg));
      } else {
        md.appendText("Cannot decrypt: wrong password or corrupted vault");
      }
      const range = target
        ? new vscode.Range(doc.positionAt(target.start), doc.positionAt(target.end))
        : undefined;
      return new vscode.Hover(md, range);
    },
  };
}

// #AVE-0007
export function createCodeLensProvider(): vscode.CodeLensProvider {
  return {
    provideCodeLenses(doc) {
      if (!isYamlDocument(doc) || peekExcluded(doc)) return [];
      const text = doc.getText();
      if (text.length > MAX_SCAN || fileVaultId(text)) return [];
      const { targets, ok } = inlineTargets(text);
      if (!ok) return [];
      return targets
        .filter((t) => t.vault)
        .flatMap((t) => {
          const at = doc.positionAt(t.start);
          const range = new vscode.Range(at, at);
          const arg: PeekArg = { uri: doc.uri.toString(), offset: t.start };
          return [
            new vscode.CodeLens(range, {
              title: "Show value",
              command: "ansibleVault.peek",
              arguments: [arg],
            }),
            new vscode.CodeLens(range, {
              title: "Copy value",
              command: "ansibleVault.peek",
              arguments: [{ ...arg, copy: true }],
            }),
          ];
        });
    },
  };
}
