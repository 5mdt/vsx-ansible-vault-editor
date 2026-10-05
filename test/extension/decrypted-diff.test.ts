import * as assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";

// #AVE-0015
suite("decrypted diff", () => {
  test("the commands are registered", async () => {
    await vscode.extensions.getExtension("5mdt.ansible-vault-editor")!.activate();
    const all = await vscode.commands.getCommands(true);
    for (const id of [
      "ansibleVault.openDecryptedChanges",
      "ansibleVault.openDecryptedStagedChanges",
      "ansibleVault.enableGitDiff",
      "ansibleVault.disableGitDiff",
    ]) {
      assert.ok(all.includes(id), id);
    }
  });

  test("a file outside any repository is refused and nothing opens", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ave-host5-"));
    try {
      const file = join(dir, "a.yml");
      writeFileSync(file, "a: 1\n");
      const doc = await vscode.workspace.openTextDocument(file);
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand("ansibleVault.openDecryptedChanges");
      assert.strictEqual(vscode.window.activeTextEditor?.document.uri.scheme, "file");
      assert.ok(!vscode.window.tabGroups.all.flatMap((g) => g.tabs).some((t) =>
        (t.input as { modified?: vscode.Uri } | undefined)?.modified?.scheme === "ansible-vault-diff"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
