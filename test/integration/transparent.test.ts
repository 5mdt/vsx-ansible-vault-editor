import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findVaultBlocks } from "../../src/detect";
import { snapshot } from "../../src/guard/snapshot";
import { planSave } from "../../src/transparent/seal";
import { NativeBackend } from "../../src/vault/backend";

const PASSWORD = "test-password";
const hasVault = spawnSync("ansible-vault", ["--version"]).status === 0;
let dir: string;
let pwFile: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ave-transparent-"));
  pwFile = join(dir, "pw");
  writeFileSync(pwFile, PASSWORD, { mode: 0o600 });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const deps = (eol: "\n" | "\r\n") => ({
  backend: new NativeBackend(),
  secretFor: async () => PASSWORD,
  eol,
});

// #AVE-0013
describe.skipIf(!hasVault)("transparent save output opens with ansible-vault", () => {
  it("encrypts only marked values and leaves other lines byte-identical (CRLF)", async () => {
    const text = "# keep\r\nname: plain\r\npw: s3cret # ansible-vault: encrypt\r\nz: 2\r\n";
    const plan = await planSave(text, snapshot(text), false, new Map(), deps("\r\n"));
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.newText.startsWith("# keep\r\nname: plain\r\npw: !vault |\r\n")).toBe(true);
    expect(plan.newText.endsWith("\r\nz: 2\r\n")).toBe(true);
    const file = join(dir, "block.vault");
    writeFileSync(file, findVaultBlocks(plan.newText)[0].ciphertext);
    const out = execFileSync("ansible-vault", ["view", "--vault-password-file", pwFile, file]);
    expect(out.toString().trimEnd()).toBe("s3cret");
  });

  it("a whole-file marker yields a file ansible-vault can view", async () => {
    const text = "# ansible-vault: encrypt\na: 1\n";
    const plan = await planSave(text, snapshot(text), false, new Map(), deps("\n"));
    if (!plan.ok) throw new Error("expected ok");
    const file = join(dir, "whole.yml");
    writeFileSync(file, plan.newText);
    const out = execFileSync("ansible-vault", ["view", "--vault-password-file", pwFile, file]);
    expect(out.toString()).toBe("a: 1\n");
  });
});
