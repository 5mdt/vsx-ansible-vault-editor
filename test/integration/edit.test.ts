import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openEdit, saveEdit } from "../../src/edit/session";
import { findVaultBlocks } from "../../src/detect";
import { SecretResolver, type SecretStore } from "../../src/secrets/resolver";
import { NativeBackend } from "../../src/vault/backend";
import { encrypt } from "../../src/vault/format";

const PASSWORD = "test-password";
const hasVault = spawnSync("ansible-vault", ["--version"]).status === 0;

class MemStore implements SecretStore {
  data = new Map<string, string>([
    ["default", PASSWORD],
    ["prod", PASSWORD],
  ]);
  get = async (id: string) => this.data.get(id);
  set = async (id: string, s: string) => void this.data.set(id, s);
  delete = async (id: string) => void this.data.delete(id);
  ids = async () => [...this.data.keys()];
}

const deps = {
  backend: new NativeBackend(),
  resolver: new SecretResolver({
    env: {},
    home: "/nonexistent-home",
    trusted: true,
    store: new MemStore(),
    report: () => {},
    prompt: async () => undefined,
  }),
};

let dir: string;
let pwFile: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ave-edit-"));
  pwFile = join(dir, "pw");
  writeFileSync(pwFile, PASSWORD, { mode: 0o600 });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const view = (file: string) =>
  execFileSync("ansible-vault", ["view", "--vault-password-file", pwFile, file], {
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();

// #AVE-0008
describe.skipIf(!hasVault)("a saved edit opens with ansible-vault", () => {
  it("file mode", async () => {
    const source = encrypt("a: 1\n", PASSWORD, { vaultId: "prod" });
    const session = await openEdit(source, undefined, deps);
    const saved = await saveEdit(session, "a: 2\nb: three\n", source, deps);
    if (saved.conflict) throw new Error("conflict");
    const file = join(dir, "file.yml");
    writeFileSync(file, saved.newSourceText);
    expect(
      execFileSync("ansible-vault", ["view", "--vault-id", `prod@${pwFile}`, file], {
        stdio: ["ignore", "pipe", "pipe"],
      }).toString(),
    ).toBe("a: 2\nb: three\n");
  });

  it("block mode", async () => {
    const cipher = encrypt("old", PASSWORD).trimEnd().split("\n");
    const source = `a: 1\nsecret: !vault |\n${cipher.map((l) => "  " + l).join("\n")}\nz: 2\n`;
    const block = findVaultBlocks(source)[0];
    const session = await openEdit(source, block.start + 2, deps);
    const saved = await saveEdit(session, "new value", source, deps);
    if (saved.conflict) throw new Error("conflict");
    const written = findVaultBlocks(saved.newSourceText)[0];
    const file = join(dir, "block.vault");
    writeFileSync(file, written.ciphertext);
    // `ansible-vault view` adds a trailing newline when the text has none.
    expect(view(file).trimEnd()).toBe("new value");
    expect(saved.newSourceText.startsWith("a: 1\nsecret: !vault |")).toBe(true);
    expect(saved.newSourceText.endsWith("z: 2\n")).toBe(true);
  });
});
