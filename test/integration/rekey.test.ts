import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findVaultBlocks } from "../../src/detect";
import { rekeyMany, rekeyText, type RekeyDeps } from "../../src/rekey/rekey";
import { NativeBackend } from "../../src/vault/backend";
import { encrypt } from "../../src/vault/format";

const hasVault = spawnSync("ansible-vault", ["--version"]).status === 0;
const backend = new NativeBackend();
const deps = (password = "old"): RekeyDeps => ({
  backend,
  decrypt: async (c) => ({ ...(await backend.decrypt(c, password)), secret: password }),
});

let dir: string;
let newPw: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "ave-rekey-"));
  newPw = join(dir, "new.pw");
  writeFileSync(newPw, "new-password", { mode: 0o600 });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const view = (file: string) =>
  execFileSync("ansible-vault", ["view", "--vault-id", `prod@${newPw}`, file], {
    stdio: ["ignore", "pipe", "pipe"],
  }).toString();

// #AVE-0009, #AVE-0010
describe.skipIf(!hasVault)("rekeyed text opens with ansible-vault", () => {
  it("a file", async () => {
    const out = await rekeyText(
      encrypt("a: 1\n", "old"),
      { vaultId: "prod", secret: "new-password" },
      deps(),
    );
    const file = join(dir, "file.yml");
    writeFileSync(file, out.text);
    expect(view(file)).toBe("a: 1\n");
  });

  it("a block", async () => {
    const lines = encrypt("hello", "old")
      .trimEnd()
      .split("\n")
      .map((l) => "  " + l)
      .join("\n");
    const out = await rekeyText(
      `a: 1\nk: !vault |\n${lines}\n`,
      { vaultId: "prod", secret: "new-password" },
      deps(),
    );
    const file = join(dir, "block.vault");
    writeFileSync(file, findVaultBlocks(out.text)[0].ciphertext);
    expect(view(file).trimEnd()).toBe("hello");
  });
});

// #AVE-0010
describe("rekey many", () => {
  const files = [
    { id: "plain.yml", text: "a: 1\n" },
    { id: "ok.yml", text: encrypt("a: 1\n", "old") },
    { id: "locked.yml", text: encrypt("b: 2\n", "someone-else") },
  ];

  it("rekeys what it can and reports the rest", async () => {
    const out = await rekeyMany(files, { secret: "new" }, deps());
    expect(out.applied.map((a) => a.id)).toEqual(["ok.yml"]);
    expect(out.failed.map((f) => f.id)).toEqual(["locked.yml"]);
    expect(out.cancelled).toBe(false);
  });

  it("applies nothing once cancelled", async () => {
    let n = 0;
    const out = await rekeyMany(files, { secret: "new" }, deps(), { cancelled: () => n++ > 1 });
    expect(out.cancelled).toBe(true);
    expect(out.applied).toEqual([]);
  });

  it("the vault ID filter leaves other IDs alone", async () => {
    const fs = [
      { id: "dev.yml", text: encrypt("a", "old", { vaultId: "dev" }) },
      { id: "prod.yml", text: encrypt("b", "old", { vaultId: "prod" }) },
    ];
    const out = await rekeyMany(fs, { vaultId: "x", secret: "new" }, deps(), { idFilter: "prod" });
    expect(out.applied.map((a) => a.id)).toEqual(["prod.yml"]);
  });
});
