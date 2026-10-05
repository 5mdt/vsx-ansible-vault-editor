import * as assert from "node:assert";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";

const PASSWORD = "host-test-password";
let dir: string;

async function open(name: string, text: string): Promise<vscode.TextEditor> {
  const file = join(dir, name);
  writeFileSync(file, text);
  const doc = await vscode.workspace.openTextDocument(file);
  return vscode.window.showTextDocument(doc);
}

const run = (id: string) => vscode.commands.executeCommand(id);

// #AVE-0005, #AVE-0006
suite("commands", () => {
  suiteSetup(async () => {
    dir = mkdtempSync(join(tmpdir(), "ave-host-"));
    const pw = join(dir, "pw");
    writeFileSync(pw, PASSWORD, { mode: 0o600 });
    await vscode.extensions.getExtension("5mdt.ansible-vault-editor")!.activate();
    await vscode.workspace
      .getConfiguration("ansibleVault")
      .update("passwordFile", pw, vscode.ConfigurationTarget.Global);
  });

  suiteTeardown(async () => {
    await vscode.workspace
      .getConfiguration("ansibleVault")
      .update("passwordFile", undefined, vscode.ConfigurationTarget.Global);
    rmSync(dir, { recursive: true, force: true });
  });

  test("encryptFile writes a vault, one undo restores the text", async () => {
    const editor = await open("a.yml", "a: 1\nb: two\n");
    await run("ansibleVault.encryptFile");
    assert.ok(editor.document.getText().startsWith("$ANSIBLE_VAULT;1.1;AES256\n"));
    await run("undo");
    assert.strictEqual(editor.document.getText(), "a: 1\nb: two\n");
  });

  test("decryptFile round-trips", async () => {
    const editor = await open("b.yml", "k: v\n");
    await run("ansibleVault.encryptFile");
    await run("ansibleVault.decryptFile");
    assert.strictEqual(editor.document.getText(), "k: v\n");
  });

  test("encryptFile refuses an already encrypted file", async () => {
    const editor = await open("c.yml", "k: v\n");
    await run("ansibleVault.encryptFile");
    const once = editor.document.getText();
    await run("ansibleVault.encryptFile");
    assert.strictEqual(editor.document.getText(), once);
  });

  test("inline encrypt and decrypt on the value under the cursor", async () => {
    const editor = await open("d.yml", "a: 1\nsecret: s3cret\nz: 2\n");
    const at = editor.document.positionAt(editor.document.getText().indexOf("s3cret") + 2);
    editor.selection = new vscode.Selection(at, at);
    await run("ansibleVault.encrypt");
    const enc = editor.document.getText();
    assert.ok(enc.includes("secret: !vault |\n  $ANSIBLE_VAULT;1.1;AES256\n"), enc);
    assert.ok(enc.startsWith("a: 1\n") && enc.endsWith("z: 2\n"), enc);
    const inBlock = editor.document.positionAt(enc.indexOf("$ANSIBLE_VAULT") + 3);
    editor.selection = new vscode.Selection(inBlock, inBlock);
    await run("ansibleVault.decrypt");
    assert.strictEqual(editor.document.getText(), "a: 1\nsecret: s3cret\nz: 2\n");
  });

  test("toggle acts on the value, then on the block", async () => {
    const editor = await open("e.yml", "k: value\n");
    const at = editor.document.positionAt(5);
    editor.selection = new vscode.Selection(at, at);
    await run("ansibleVault.toggle");
    assert.ok(editor.document.getText().includes("!vault |"));
    const p = editor.document.positionAt(editor.document.getText().indexOf("$ANSIBLE") + 2);
    editor.selection = new vscode.Selection(p, p);
    await run("ansibleVault.toggle");
    assert.strictEqual(editor.document.getText(), "k: value\n");
  });

  test("encryptAllInFile is registered", async () => {
    const have = await vscode.commands.getCommands(true);
    assert.ok(have.includes("ansibleVault.encryptAllInFile"));
    assert.ok(have.includes("ansibleVault.decryptAllInFile"));
  });
});
