import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../../src/vault/format";

const hasAnsibleVault = spawnSync("ansible-vault", ["--version"]).status === 0;
const PASSWORD = "test-password";

// ansible-vault refuses non-blocking stdio; give it a pipe for stderr.
function cli(args: string[]): void {
  execFileSync("ansible-vault", args, { stdio: ["ignore", "pipe", "pipe"] });
}

// AVE-0001
describe.skipIf(!hasAnsibleVault)("interop with ansible-vault", () => {
  let dir: string;
  let pwFile: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ave-"));
    pwFile = join(dir, "pw");
    writeFileSync(pwFile, PASSWORD, { mode: 0o600 });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it.each([
    ["1.1", undefined],
    ["1.2", "prod"],
  ])("native encrypt (%s) -> ansible-vault decrypt", (_v, vaultId) => {
    const file = join(dir, `native-${vaultId ?? "none"}`);
    writeFileSync(file, encrypt("from native\n", PASSWORD, { vaultId }));
    cli(["decrypt", "--vault-password-file", pwFile, file]);
    expect(readFileSync(file, "utf8")).toBe("from native\n");
  });

  it.each([
    ["1.1", undefined],
    ["1.2", "prod"],
  ])("ansible-vault encrypt (%s) -> native decrypt", (_v, vaultId) => {
    const file = join(dir, `cli-${vaultId ?? "none"}`);
    writeFileSync(file, "from cli\n");
    cli([
      "encrypt",
      ...(vaultId
        ? ["--encrypt-vault-id", vaultId, "--vault-id", `${vaultId}@${pwFile}`]
        : ["--vault-password-file", pwFile]),
      file,
    ]);
    const out = decrypt(readFileSync(file, "utf8"), PASSWORD);
    expect(out.plaintext.toString("utf8")).toBe("from cli\n");
    expect(out.vaultId).toBe(vaultId);
  });
});
