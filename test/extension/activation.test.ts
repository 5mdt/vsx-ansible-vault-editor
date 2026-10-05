import * as assert from "node:assert";
import * as vscode from "vscode";

// AVE-0014
suite("extension activation", () => {
  const ext = () => vscode.extensions.getExtension("5mdt.ansible-vault-editor");

  test("activates", async () => {
    assert.ok(ext(), "extension not found");
    await ext()!.activate();
    assert.strictEqual(ext()!.isActive, true);
  });

  test("registers every contributed command", async () => {
    await ext()!.activate();
    const wanted: { command: string }[] =
      ext()!.packageJSON.contributes.commands;
    const have = new Set(await vscode.commands.getCommands(true));
    for (const { command } of wanted) {
      assert.ok(have.has(command), `${command} not registered`);
    }
  });
});
