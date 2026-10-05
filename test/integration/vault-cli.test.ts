import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CliBackend, NativeBackend } from "../../src/vault/backend";
import { decrypt, encrypt } from "../../src/vault/format";

const hasAnsibleVault = spawnSync("ansible-vault", ["--version"]).status === 0;
const PASSWORD = "test-password";
const fixtures = join(__dirname, "..", "fixtures", "vault");

// CI sets this so a missing ansible-vault fails instead of skipping.
if (process.env.AVE_REQUIRE_ANSIBLE === "1" && !hasAnsibleVault) {
  throw new Error("AVE_REQUIRE_ANSIBLE=1 but ansible-vault is not runnable");
}

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

// #AVE-0002
describe.skipIf(!hasAnsibleVault)("backends agree", () => {
  const native = new NativeBackend();
  const cli = new CliBackend("ansible-vault");

  it.each(["empty", "short", "multiline", "with-id"])(
    "fixture %s decrypts equally in both",
    async (name) => {
      const text = readFileSync(join(fixtures, `${name}.vault`), "utf8");
      const expected = readFileSync(join(fixtures, `${name}.txt`));
      const a = await native.decrypt(text, PASSWORD);
      const b = await cli.decrypt(text, PASSWORD);
      expect(a.plaintext.equals(expected)).toBe(true);
      expect(b.plaintext.equals(expected)).toBe(true);
      expect(b.vaultId).toBe(a.vaultId);
    },
  );

  it.each([undefined, "prod"])("cli encrypt (%s) -> native decrypt", async (vaultId) => {
    const text = await cli.encrypt("via cli\n", PASSWORD, { vaultId });
    const out = await native.decrypt(text, PASSWORD);
    expect(out.plaintext.toString()).toBe("via cli\n");
    expect(out.vaultId).toBe(vaultId);
  });

  it.each([undefined, "prod"])("native encrypt (%s) -> cli decrypt", async (vaultId) => {
    const text = await native.encrypt("via native\n", PASSWORD, { vaultId });
    const out = await cli.decrypt(text, PASSWORD);
    expect(out.plaintext.toString()).toBe("via native\n");
    expect(out.vaultId).toBe(vaultId);
  });

  it("cli rekey opens only with the new password", async () => {
    const text = await native.encrypt("rk", PASSWORD, { vaultId: "prod" });
    const re = await cli.rekey(text, PASSWORD, "other-pw");
    expect((await native.decrypt(re, "other-pw")).plaintext.toString()).toBe("rk");
    await expect(native.decrypt(re, PASSWORD)).rejects.toThrow();
  });
});
