import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CliBackend, NativeBackend, type VaultBackend } from "../../src/vault/backend";
import { SecretResolver, type SecretStore } from "../../src/secrets/resolver";
import { decryptWithSecrets } from "../../src/secrets/vault-ids";

const hasAnsibleVault = spawnSync("ansible-vault", ["--version"]).status === 0;
const fixtures = join(__dirname, "..", "fixtures", "vault");
const PASSWORD = "test-password";

class MemStore implements SecretStore {
  data = new Map<string, string>();
  get = async (id: string) => this.data.get(id);
  set = async (id: string, s: string) => void this.data.set(id, s);
  delete = async (id: string) => void this.data.delete(id);
  ids = async () => [...this.data.keys()];
}

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ave-sec-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function resolverFor(): SecretResolver {
  return new SecretResolver({
    env: {},
    workspaceRoot: root,
    home: join(root, "no-home"),
    trusted: true,
    store: new MemStore(),
    report: () => {},
    prompt: async () => {
      throw new Error("prompt must not be called");
    },
  });
}

const backends: [string, () => VaultBackend][] = [
  ["native", () => new NativeBackend()],
  ...(hasAnsibleVault
    ? ([["cli", () => new CliBackend("ansible-vault")]] as [string, () => VaultBackend][])
    : []),
];

// #AVE-0003
describe.each(backends)("workspace config decrypts without a prompt (%s)", (_n, mk) => {
  const vault = () => readFileSync(join(fixtures, "short.vault"), "utf8");

  it("ansible.cfg -> vault_password_file", async () => {
    writeFileSync(join(root, "pw.txt"), PASSWORD + "\n");
    writeFileSync(join(root, "ansible.cfg"), "[defaults]\nvault_password_file = pw.txt\n");
    const out = await decryptWithSecrets(vault(), mk(), resolverFor());
    expect(out.plaintext.toString()).toBe("hello vault\n");
  });

  it("ansible.cfg -> executable password script", async () => {
    const script = join(root, "pw.sh");
    writeFileSync(script, `#!/bin/sh\nprintf '${PASSWORD}\\n'\n`);
    chmodSync(script, 0o755);
    writeFileSync(join(root, "ansible.cfg"), "[defaults]\nvault_password_file = pw.sh\n");
    const out = await decryptWithSecrets(vault(), mk(), resolverFor());
    expect(out.plaintext.toString()).toBe("hello vault\n");
  });
});

// #AVE-0004
describe.skipIf(!hasAnsibleVault)("vault id with only the right secret", () => {
  it.each(backends)("prod file opens with prod@right + dev@wrong (%s)", async (_n, mk) => {
    writeFileSync(join(root, "prod.pw"), PASSWORD);
    writeFileSync(join(root, "dev.pw"), "not-the-password");
    const file = join(root, "secret.yml");
    writeFileSync(file, "from prod\n");
    execFileSync(
      "ansible-vault",
      ["encrypt", "--vault-id", `prod@${join(root, "prod.pw")}`, file],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    writeFileSync(
      join(root, "ansible.cfg"),
      "[defaults]\nvault_identity_list = dev@dev.pw, prod@prod.pw\n",
    );
    const out = await decryptWithSecrets(readFileSync(file, "utf8"), mk(), resolverFor());
    expect(out.plaintext.toString()).toBe("from prod\n");
    expect(out.vaultId).toBe("prod");
  });
});
