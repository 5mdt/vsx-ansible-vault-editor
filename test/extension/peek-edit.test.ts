import * as assert from "node:assert";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { decrypt, encrypt } from "../../src/vault/format";

const PASSWORD = "host-peek-password";
const marker = () => `PLAIN${Date.now()}X${Math.floor(Math.random() * 1e9)}`;
let dir: string;
let pwFile: string;

const setPasswordFile = (value: string | undefined) =>
  vscode.workspace
    .getConfiguration("ansibleVault")
    .update("passwordFile", value, vscode.ConfigurationTarget.Global);

function blockText(plain: string, key = "secret"): string {
  const lines = encrypt(plain, PASSWORD).trimEnd().split("\n");
  return `a: 1\n${key}: !vault |\n${lines.map((l) => "  " + l).join("\n")}\nz: 2\n`;
}

async function open(name: string, text: string): Promise<vscode.TextEditor> {
  const file = join(dir, name);
  writeFileSync(file, text);
  const doc = await vscode.workspace.openTextDocument(file);
  return vscode.window.showTextDocument(doc);
}

async function hoverText(doc: vscode.TextDocument, offset: number): Promise<string> {
  const hovers = (await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    doc.uri,
    doc.positionAt(offset),
  ))!;
  return hovers
    .flatMap((h) => h.contents)
    .map((c) => (typeof c === "string" ? c : c.value))
    .join("\n");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// #AVE-0007, #AVE-0008
suite("peek and edit decrypted", () => {
  suiteSetup(async () => {
    dir = mkdtempSync(join(tmpdir(), "ave-host2-"));
    pwFile = join(dir, "pw");
    writeFileSync(pwFile, PASSWORD, { mode: 0o600 });
    await vscode.extensions.getExtension("5mdt.ansible-vault-editor")!.activate();
    await setPasswordFile(pwFile);
  });

  suiteTeardown(async () => {
    await setPasswordFile(undefined);
    rmSync(dir, { recursive: true, force: true });
  });

  test("hover shows the plaintext and leaves the document untouched", async () => {
    const m = marker();
    const editor = await open("h1.yml", blockText(m));
    const doc = editor.document;
    const version = doc.version;
    const text = await hoverText(doc, doc.getText().indexOf("$ANSIBLE") + 3);
    assert.ok(text.includes(m), text);
    assert.ok(text.includes("Copy") && text.includes("Edit decrypted"), text);
    assert.strictEqual(doc.version, version);
    assert.strictEqual(doc.isDirty, false);
  });

  test("hover without a configured secret offers Enter password", async () => {
    await setPasswordFile(undefined);
    try {
      const editor = await open("h2.yml", blockText("nobody-can-see-this"));
      const text = await hoverText(editor.document, editor.document.getText().indexOf("$ANSIBLE") + 3);
      assert.ok(text.includes("Enter password"), text);
      assert.ok(!text.includes("nobody-can-see-this"), text);
    } finally {
      await setPasswordFile(pwFile);
    }
  });

  test("hover is off when ansibleVault.hover.enabled is false", async () => {
    const cfg = vscode.workspace.getConfiguration("ansibleVault");
    await cfg.update("hover.enabled", false, vscode.ConfigurationTarget.Global);
    try {
      const editor = await open("h3.yml", blockText("hidden-by-setting"));
      const text = await hoverText(editor.document, editor.document.getText().indexOf("$ANSIBLE") + 3);
      assert.ok(!text.includes("hidden-by-setting"), text);
    } finally {
      await cfg.update("hover.enabled", undefined, vscode.ConfigurationTarget.Global);
    }
  });

  test("peekExclude hides matching files", async () => {
    const cfg = vscode.workspace.getConfiguration("ansibleVault");
    await cfg.update("peekExclude", ["**/h4*.yml"], vscode.ConfigurationTarget.Global);
    try {
      const editor = await open("h4.yml", blockText("excluded-value"));
      const text = await hoverText(editor.document, editor.document.getText().indexOf("$ANSIBLE") + 3);
      assert.ok(!text.includes("excluded-value"), text);
    } finally {
      await cfg.update("peekExclude", undefined, vscode.ConfigurationTarget.Global);
    }
  });

  test("CodeLens offers Show and Copy per block", async () => {
    const second = blockText("y", "two").replace("a: 1\n", "").replace("z: 2\n", "");
    const editor = await open("l1.yml", blockText("x", "one") + second);
    const lenses = (await vscode.commands.executeCommand<vscode.CodeLens[]>(
      "vscode.executeCodeLensProvider",
      editor.document.uri,
    ))!;
    const titles = lenses.map((l) => l.command?.title);
    assert.deepStrictEqual(titles, ["Show value", "Copy value", "Show value", "Copy value"]);
  });

  test("edit decrypted: file stays ciphertext on disk, edits are re-encrypted on save", async function () {
    this.timeout(60000);
    const m = marker();
    const file = join(dir, "vaulted.yml");
    writeFileSync(file, encrypt("a: 1\n", PASSWORD, { vaultId: "prod" }));
    const original = readFileSync(file, "utf8");
    await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file));
    await vscode.commands.executeCommand("ansibleVault.editDecrypted");
    const editor = vscode.window.activeTextEditor!;
    assert.strictEqual(editor.document.uri.scheme, "ansible-vault");
    assert.strictEqual(editor.document.getText(), "a: 1\n");
    assert.strictEqual(readFileSync(file, "utf8"), original);

    await editor.edit((e) => e.insert(new vscode.Position(0, 0), `${m}: yes\n`));
    assert.strictEqual(readFileSync(file, "utf8"), original, "disk changed before save");
    await vscode.commands.executeCommand("workbench.action.files.save");
    await sleep(300);

    const onDisk = readFileSync(file, "utf8");
    assert.ok(onDisk.startsWith("$ANSIBLE_VAULT;1.2;AES256;prod\n"), onDisk);
    assert.ok(!onDisk.includes(m));
    assert.strictEqual(decrypt(onDisk, PASSWORD).plaintext.toString(), `${m}: yes\na: 1\n`);
    const leaked = execSync(`grep -rIl ${m} "${tmpdir()}" 2>/dev/null || true`, { timeout: 30000 })
      .toString()
      .trim();
    assert.strictEqual(leaked, "", `plaintext found in temp dir: ${leaked}`);

    const virtual = editor.document.uri;
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
    // VS Code disposes the text model after the tab closes, not synchronously.
    let served = true;
    for (let i = 0; i < 40 && served; i++) {
      await sleep(250);
      served = await Promise.resolve(vscode.workspace.fs.readFile(virtual)).then(
        () => true,
        () => false,
      );
    }
    assert.strictEqual(served, false, "plaintext still served 10s after the tab closed");
  });

  test("edit decrypted on a single block rewrites only that block", async () => {
    const m = marker();
    const text = blockText("old-value");
    const editor = await open("block.yml", text);
    const at = editor.document.positionAt(text.indexOf("$ANSIBLE") + 3);
    editor.selection = new vscode.Selection(at, at);
    await vscode.commands.executeCommand("ansibleVault.editDecrypted");
    const virtual = vscode.window.activeTextEditor!;
    assert.strictEqual(virtual.document.uri.scheme, "ansible-vault");
    assert.strictEqual(virtual.document.getText(), "old-value");

    await virtual.edit((e) =>
      e.replace(new vscode.Range(new vscode.Position(0, 0), virtual.document.positionAt(9)), m),
    );
    await vscode.commands.executeCommand("workbench.action.files.save");
    await sleep(300);

    const onDisk = readFileSync(join(dir, "block.yml"), "utf8");
    assert.ok(onDisk.startsWith("a: 1\nsecret: !vault |\n"), onDisk);
    assert.ok(onDisk.endsWith("z: 2\n"), onDisk);
    assert.ok(!onDisk.includes(m));
    const cipher = onDisk
      .split("\n")
      .filter((l) => /^ {2}(\$ANSIBLE_VAULT|[0-9a-f]+$)/.test(l))
      .map((l) => l.trim())
      .join("\n");
    assert.strictEqual(decrypt(cipher + "\n", PASSWORD).plaintext.toString(), m);
    await vscode.commands.executeCommand("workbench.action.closeActiveEditor");
  });

  test("edit decrypted refuses a plain file", async () => {
    await open("plain.yml", "a: 1\n");
    await vscode.commands.executeCommand("ansibleVault.editDecrypted");
    assert.notStrictEqual(vscode.window.activeTextEditor?.document.uri.scheme, "ansible-vault");
  });
});
