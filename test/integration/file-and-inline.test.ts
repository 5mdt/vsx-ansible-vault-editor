import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileEncrypt } from "../../src/commands/file-ops";
import { prepareEncrypt, type OpsDeps } from "../../src/commands/session";
import { encryptValueEdit } from "../../src/inline/edits";
import { plainScalars } from "../../src/inline/yaml-values";
import { SecretResolver, type SecretStore } from "../../src/secrets/resolver";
import { NativeBackend } from "../../src/vault/backend";

const PASSWORD = "test-password";
const hasAnsible = spawnSync("ansible-playbook", ["--version"]).status === 0;
const hasVault = spawnSync("ansible-vault", ["--version"]).status === 0;

class MemStore implements SecretStore {
  data = new Map<string, string>([["default", PASSWORD]]);
  get = async (id: string) => this.data.get(id);
  set = async (id: string, s: string) => void this.data.set(id, s);
  delete = async (id: string) => void this.data.delete(id);
  ids = async () => [...this.data.keys()];
}

const deps: OpsDeps = {
  backend: new NativeBackend(),
  pick: async () => undefined,
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
  dir = mkdtempSync(join(tmpdir(), "ave-fi-"));
  pwFile = join(dir, "pw");
  writeFileSync(pwFile, PASSWORD, { mode: 0o600 });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const quiet = { stdio: ["ignore", "pipe", "pipe"] as ["ignore", "pipe", "pipe"] };

// #AVE-0005
describe.skipIf(!hasVault)("file encrypt read by ansible-vault", () => {
  it("ansible-vault view shows the original", async () => {
    const original = "all:\n  hosts: {}\n";
    const session = (await prepareEncrypt(deps))!;
    const file = join(dir, "inventory.yml");
    writeFileSync(file, await fileEncrypt(original, session, "\n"));
    const out = execFileSync(
      "ansible-vault",
      ["view", "--vault-password-file", pwFile, file],
      quiet,
    );
    expect(out.toString()).toBe(original);
  });
});

// #AVE-0006
describe.skipIf(!hasAnsible)("inline blocks read by ansible-playbook", () => {
  it("nested key and list item values are decrypted at run time", async () => {
    const outFile = join(dir, "out.txt");
    const source = [
      "- hosts: localhost",
      "  connection: local",
      "  gather_facts: false",
      "  vars:",
      "    db:",
      "      password: s3cret",
      "    items:",
      "      - listsecret",
      "  tasks:",
      "    - ansible.builtin.copy:",
      `        content: "{{ db.password }}|{{ items[0] }}"`,
      `        dest: ${outFile}`,
      "",
    ].join("\n");
    const session = (await prepareEncrypt(deps))!;
    const targets = plainScalars(source).filter((t) =>
      ["s3cret", "listsecret"].includes(t.value),
    );
    expect(targets).toHaveLength(2);
    const edits = await Promise.all(targets.map((t) => encryptValueEdit(t, session, "\n")));
    const encrypted = edits
      .sort((a, b) => b.start - a.start)
      .reduce((t, e) => t.slice(0, e.start) + e.newText + t.slice(e.end), source);
    expect(encrypted).not.toContain("s3cret");
    const playbook = join(dir, "play.yml");
    writeFileSync(playbook, encrypted);
    execFileSync(
      "ansible-playbook",
      ["-i", "localhost,", "--vault-password-file", pwFile, playbook],
      { ...quiet, env: { ...process.env, ANSIBLE_HOME: join(dir, "ansible-home") } },
    );
    expect(readFileSync(outFile, "utf8")).toBe("s3cret|listsecret");
  }, 60_000);
});
