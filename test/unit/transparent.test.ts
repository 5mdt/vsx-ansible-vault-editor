import { describe, expect, it } from "vitest";
import { snapshot } from "../../src/guard/snapshot";
import { SecretResolver, type SecretStore } from "../../src/secrets/resolver";
import { decryptForBuffer } from "../../src/transparent/open";
import { planSave, type SealDeps } from "../../src/transparent/seal";
import { NativeBackend } from "../../src/vault/backend";
import { decrypt, encrypt, parseEnvelope } from "../../src/vault/format";

class MemStore implements SecretStore {
  data = new Map<string, string>();
  get = async (id: string) => this.data.get(id);
  set = async (id: string, s: string) => void this.data.set(id, s);
  delete = async (id: string) => void this.data.delete(id);
  ids = async () => [...this.data.keys()];
}
function resolver(keys: Record<string, string> = { default: "pw", prod: "pw" }) {
  const store = new MemStore();
  for (const [k, v] of Object.entries(keys)) store.data.set(k, v);
  return new SecretResolver({
    env: {}, home: "/nonexistent-home", trusted: true, store, report: () => {}, prompt: async () => undefined,
  });
}
const backend = new NativeBackend();
const sealDeps = (secret: string | null = "pw", defaultVaultId?: string): SealDeps => ({
  backend, defaultVaultId, secretFor: async () => secret ?? undefined, eol: "\n",
});
const block = (key: string, plain: string, id?: string) =>
  `${key}: !vault |\n${encrypt(plain, "pw", { vaultId: id }).trimEnd().split("\n").map((l) => "  " + l).join("\n")}\n`;

// #AVE-0013
describe("transparent mode", () => {
  it("opens a vaulted file as marked plaintext and saves it back unchanged", async () => {
    const source = encrypt("a: 1\n", "pw", { vaultId: "prod" });
    const open = await decryptForBuffer(source, { backend, resolver: resolver() }, "\n");
    expect(open.state).toBe("plain");
    if (open.state !== "plain") return;
    expect(open.text).toBe("# ansible-vault: encrypt id=prod\na: 1\n");
    const plan = await planSave(open.text, snapshot(source), false, open.cache, sealDeps());
    expect(plan.ok && plan.newText).toBe(source);
  });

  it("re-encrypts an edited file with the original vault id and no marker", async () => {
    const source = encrypt("a: 1\n", "pw", { vaultId: "prod" });
    const plan = await planSave("# ansible-vault: encrypt id=other\na: 2\n", snapshot(source), false, new Map(), sealDeps());
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(parseEnvelope(plan.newText).vaultId).toBe("prod");
    expect(decrypt(plan.newText, "pw").plaintext.toString()).toBe("a: 2\n");
  });

  it("vault id precedence: header, then id=, then default", async () => {
    const t = "a: x # ansible-vault: encrypt id=prod\nb: y # ansible-vault: encrypt\n";
    const plan = await planSave(t, snapshot(t), false, new Map(), sealDeps("pw", "dflt"));
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const ids = [...plan.newText.matchAll(/\$ANSIBLE_VAULT;1\.2;AES256;(\S+)/g)].map((m) => m[1]);
    expect(ids).toEqual(["prod", "dflt"]);
    const hdr = "# ansible-vault: encrypt id=file\na: 1\n";
    const whole = await planSave(hdr, snapshot("a: 1\n"), false, new Map(), sealDeps("pw", "dflt"));
    expect(whole.ok && parseEnvelope(whole.newText).vaultId).toBe("file");
    const bare = await planSave("# ansible-vault: encrypt\na: 1\n", snapshot("a: 1\n"), false, new Map(), sealDeps("pw", "dflt"));
    expect(bare.ok && parseEnvelope(bare.newText).vaultId).toBe("dflt");
  });

  it("an unchanged value keeps its ciphertext byte for byte, an edited one does not", async () => {
    const two = block("two", "second");
    const source = `a: 1\n${block("one", "first", "prod")}${two}`;
    const open = await decryptForBuffer(source, { backend, resolver: resolver() }, "\n");
    if (open.state !== "plain") throw new Error("expected plain");
    expect(open.text).toContain("one: first # ansible-vault: encrypt id=prod");
    const same = await planSave(open.text, snapshot(source), false, open.cache, sealDeps());
    expect(same.ok && same.newText).toBe(source);
    const edited = open.text.replace("first", "changed");
    const plan = await planSave(edited, snapshot(source), false, open.cache, sealDeps());
    if (!plan.ok) throw new Error("expected ok");
    expect(plan.newText).not.toBe(source);
    expect(plan.newText).toContain(two);
    expect(plan.newText).not.toContain("changed");
    expect(plan.newText).not.toContain("ansible-vault: encrypt");
  });

  it("multi-line values round-trip", async () => {
    const source = block("m", "line one\nline two");
    const open = await decryptForBuffer(source, { backend, resolver: resolver() }, "\n");
    if (open.state !== "plain") throw new Error("expected plain");
    expect(open.text).toContain("m: |- # ansible-vault: encrypt");
    const plan = await planSave(open.text, snapshot(source), false, open.cache, sealDeps());
    expect(plan.ok && plan.newText).toBe(source);
  });

  it("without a secret nothing is written and no plaintext leaks", async () => {
    const t = "pw: hunter2 # ansible-vault: encrypt\n";
    const plan = await planSave(t, snapshot(t), false, new Map(), sealDeps(null));
    expect(plan).toEqual({ ok: false, reason: "no-secret" });
    const open = await decryptForBuffer(encrypt("a: 1\n", "pw"), { backend, resolver: resolver({}) }, "\n");
    expect(open.state).toBe("no-secret");
  });

  it("a glob file with no history is encrypted whole", async () => {
    const plan = await planSave("a: 1\n", snapshot("a: 1\n"), true, new Map(), sealDeps());
    expect(plan.ok && plan.newText.startsWith("$ANSIBLE_VAULT;")).toBe(true);
  });
});
