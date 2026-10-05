import * as assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { decrypt, encrypt, parseEnvelope, VaultAuthError } from "../../src/vault/format";

const OLD = "host-old-password";
const NEW = "host-new-password";
let dir: string;

const cfg = () => vscode.workspace.getConfiguration("ansibleVault");
const set = (key: string, value: unknown) =>
  cfg().update(key, value, vscode.ConfigurationTarget.Global);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function open(name: string, text: string): Promise<vscode.TextDocument> {
  const file = join(dir, name);
  writeFileSync(file, text);
  const doc = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(doc);
  return doc;
}

/** Answers the pickers and boxes the rekey command shows. */
function answerPrompts(vaultId: string): () => void {
  const w = vscode.window as unknown as Record<string, unknown>;
  const saved = { q: w.showQuickPick, i: w.showInputBox };
  w.showQuickPick = async (items: vscode.QuickPickItem[]) =>
    items.find((i) => i.label === vaultId) ?? items.find((i) => i.label === "New vault ID...");
  w.showInputBox = async (o?: vscode.InputBoxOptions) => (o?.title === "New vault ID" ? vaultId : NEW);
  return () => {
    w.showQuickPick = saved.q;
    w.showInputBox = saved.i;
  };
}

// #AVE-0009
suite("rekey", () => {
  suiteSetup(async () => {
    dir = mkdtempSync(join(tmpdir(), "ave-host4-"));
    const pw = join(dir, "pw");
    writeFileSync(pw, OLD, { mode: 0o600 });
    await vscode.extensions.getExtension("5mdt.ansible-vault-editor")!.activate();
    await set("passwordFile", pw);
  });

  suiteTeardown(async () => {
    for (const k of ["passwordFile", "transparent"]) await set(k, undefined);
    // The rekey left the new password in the session cache; other suites expect none.
    await vscode.commands.executeCommand("ansibleVault.forgetPasswords");
    rmSync(dir, { recursive: true, force: true });
  });

  test("a plain file is refused and left alone", async () => {
    const doc = await open("plain.yml", "a: 1\n");
    await vscode.commands.executeCommand("ansibleVault.rekey");
    assert.strictEqual(doc.getText(), "a: 1\n");
  });

  test("an open vaulted file is rekeyed to the chosen ID", async () => {
    await set("transparent", false);
    const doc = await open("v.yml", encrypt("a: 1\n", OLD));
    const restore = answerPrompts("prod");
    try {
      await vscode.commands.executeCommand("ansibleVault.rekey");
    } finally {
      restore();
    }
    const text = doc.getText();
    assert.ok(text.startsWith("$ANSIBLE_VAULT;1.2;AES256;"), "header with an ID");
    assert.strictEqual(decrypt(text, NEW).plaintext.toString(), "a: 1\n");
    assert.throws(() => decrypt(text, OLD), VaultAuthError);
    assert.ok(parseEnvelope(text).vaultId);
  });

  test("transparent: the disk is rekeyed and the next save keeps the new key", async () => {
    await set("transparent", true);
    const file = "t.yml";
    const doc = await open(file, encrypt("a: 1\n", OLD));
    for (let i = 0; i < 100 && !doc.getText().startsWith("# ansible-vault"); i++) await sleep(50);
    const restore = answerPrompts("prod");
    try {
      await vscode.commands.executeCommand("ansibleVault.rekey");
    } finally {
      restore();
    }
    const first = readFileSync(join(dir, file), "utf8");
    assert.strictEqual(decrypt(first, NEW).plaintext.toString(), "a: 1\n");
    assert.throws(() => decrypt(first, OLD), VaultAuthError);
    for (let i = 0; i < 100 && !doc.getText().startsWith("# ansible-vault"); i++) await sleep(50);
    assert.ok(doc.getText().startsWith("# ansible-vault: encrypt"), "buffer stays plain");
    await doc.save();
    const second = readFileSync(join(dir, file), "utf8");
    assert.strictEqual(decrypt(second, NEW).plaintext.toString(), "a: 1\n");
  });
});
