import * as assert from "node:assert";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as vscode from "vscode";
import { decrypt, encrypt } from "../../src/vault/format";

const PASSWORD = "host-guard-password";
let dir: string;

const cfg = () => vscode.workspace.getConfiguration("ansibleVault");
const set = (key: string, value: unknown) =>
  cfg().update(key, value, vscode.ConfigurationTarget.Global);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(check: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await sleep(50);
  }
  assert.fail(`timed out waiting for ${what}`);
}

async function open(name: string, text: string): Promise<vscode.TextDocument> {
  const file = join(dir, name);
  writeFileSync(file, text);
  const doc = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(doc);
  return doc;
}

async function append(doc: vscode.TextDocument, text: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.insert(doc.uri, doc.positionAt(doc.getText().length), text);
  await vscode.workspace.applyEdit(edit);
}

// #AVE-0011, #AVE-0013
suite("save guard and transparent mode", () => {
  suiteSetup(async () => {
    dir = mkdtempSync(join(tmpdir(), "ave-host3-"));
    const pw = join(dir, "pw");
    writeFileSync(pw, PASSWORD, { mode: 0o600 });
    await vscode.extensions.getExtension("5mdt.ansible-vault-editor")!.activate();
    await set("passwordFile", pw);
  });

  suiteTeardown(async () => {
    for (const k of ["passwordFile", "transparent", "saveGuard", "mustEncryptGlobs"]) {
      await set(k, undefined);
    }
    rmSync(dir, { recursive: true, force: true });
  });

  test("transparent: opens decrypted, saves ciphertext, buffer stays plain", async () => {
    await set("transparent", true);
    const source = encrypt("a: 1\n", PASSWORD);
    const file = "t1.yml";
    const doc = await open(file, source);
    await until(() => doc.getText().startsWith("# ansible-vault: encrypt"), "decrypted buffer");
    assert.strictEqual(doc.getText(), "# ansible-vault: encrypt\na: 1\n");
    await append(doc, "b: 2\n");
    await doc.save();
    const onDisk = readFileSync(join(dir, file), "utf8");
    assert.ok(onDisk.startsWith("$ANSIBLE_VAULT;"), "disk holds ciphertext");
    assert.strictEqual(decrypt(onDisk, PASSWORD).plaintext.toString(), "a: 1\nb: 2\n");
    await until(() => doc.getText().includes("b: 2"), "plaintext restored");
    assert.ok(doc.getText().startsWith("# ansible-vault: encrypt"));
  });

  test("transparent: a typed value marker is encrypted on save", async () => {
    await set("transparent", true);
    const file = "t2.yml";
    const doc = await open(file, "name: plain\n");
    await append(doc, "pw: hunter2 # ansible-vault: encrypt\n");
    await doc.save();
    const onDisk = readFileSync(join(dir, file), "utf8");
    assert.ok(onDisk.startsWith("name: plain\npw: !vault |"));
    assert.ok(!onDisk.includes("hunter2"));
  });

  test("transparent: an unedited save leaves the bytes identical", async () => {
    await set("transparent", true);
    const file = "t3.yml";
    const doc = await open(file, encrypt("a: 1\n", PASSWORD));
    await until(() => doc.getText().startsWith("# ansible-vault: encrypt"), "decrypted buffer");
    await doc.save();
    const first = readFileSync(join(dir, file), "utf8");
    await until(() => doc.getText().startsWith("# ansible-vault: encrypt"), "plaintext restored");
    await append(doc, "");
    await doc.save();
    assert.strictEqual(readFileSync(join(dir, file), "utf8"), first);
  });

  test("guard: a must-encrypt file is held, the disk bytes do not change", async () => {
    await set("transparent", false);
    await set("saveGuard", "block");
    await set("mustEncryptGlobs", ["**/guarded-*.yml"]);
    const file = "guarded-a.yml";
    const doc = await open(file, "a: 1\n");
    await append(doc, "secret: leaked\n");
    await doc.save();
    // The dialog is not answered here; the file must be untouched either way.
    assert.strictEqual(readFileSync(join(dir, file), "utf8"), "a: 1\n");
    await until(() => doc.getText().includes("secret: leaked"), "plaintext restored");
  });
});
