import fs from "node:fs";
import { parse as yamlParse } from "yaml";
import { describe, expect, it, vi } from "vitest";
import { openEdit, saveEdit } from "../../src/edit/session";
import { hashText } from "../../src/util";
import { RefusedError } from "../../src/errors";
import { inlineTargets } from "../../src/inline/yaml-values";
import { SecretResolver, type SecretStore } from "../../src/secrets/resolver";
import { NativeBackend } from "../../src/vault/backend";
import { decrypt, encrypt, parseEnvelope } from "../../src/vault/format";

class MemStore implements SecretStore {
  data = new Map<string, string>();
  get = async (id: string) => this.data.get(id);
  set = async (id: string, s: string) => void this.data.set(id, s);
  delete = async (id: string) => void this.data.delete(id);
  ids = async () => [...this.data.keys()];
}

function deps(keychain: Record<string, string> = { default: "pw", prod: "pw" }) {
  const store = new MemStore();
  for (const [k, v] of Object.entries(keychain)) store.data.set(k, v);
  return {
    backend: new NativeBackend(),
    resolver: new SecretResolver({
      env: {},
      home: "/nonexistent-home",
      trusted: true,
      store,
      report: () => {},
      prompt: async () => undefined,
    }),
  };
}

function withBlocks(eol: "\n" | "\r\n" = "\n"): string {
  const one = encrypt("first", "pw", { eol: "\n" }).trimEnd().split("\n");
  const two = encrypt("second", "pw", { vaultId: "prod" }).trimEnd().split("\n");
  const ind = (ls: string[]) => ls.map((l) => "    " + l).join("\n");
  return ["# keep", "a:", "  one: !vault |", ind(one), "  two: !vault |", ind(two), "z: 1", ""]
    .join("\n")
    .replace(/\n/g, eol);
}

// #AVE-0008
describe("edit a vaulted file", () => {
  it("opens decrypted, saves encrypted, vault id preserved", async () => {
    const d = deps();
    const source = encrypt("a: 1\n", "pw", { vaultId: "prod" });
    const session = await openEdit(source, undefined, d);
    expect(session.kind).toBe("file");
    expect(session.plaintext.toString()).toBe("a: 1\n");
    expect(session.vaultId).toBe("prod");
    const saved = await saveEdit(session, "a: 2\n", source, d);
    expect(saved.conflict).toBe(false);
    if (saved.conflict) return;
    expect(parseEnvelope(saved.newSourceText).vaultId).toBe("prod");
    expect(decrypt(saved.newSourceText, "pw").plaintext.toString()).toBe("a: 2\n");
    expect(saved.newSourceText).not.toContain("a: 2");
  });

  it("a 1.1 file stays 1.1", async () => {
    const d = deps();
    const source = encrypt("x", "pw");
    const session = await openEdit(source, undefined, d);
    const saved = await saveEdit(session, "y", source, d);
    if (saved.conflict) throw new Error("conflict");
    expect(parseEnvelope(saved.newSourceText).version).toBe("1.1");
  });

  it("CRLF source stays CRLF", async () => {
    const d = deps();
    const source = encrypt("x", "pw", { eol: "\r\n" });
    const session = await openEdit(source, undefined, d);
    const saved = await saveEdit(session, "y", source, d);
    if (saved.conflict) throw new Error("conflict");
    expect(saved.newSourceText.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("a plain file is refused", async () => {
    await expect(openEdit("a: 1\n", undefined, deps())).rejects.toThrow(RefusedError);
    await expect(openEdit("a: 1\n", 2, deps())).rejects.toThrow(/nothing to decrypt here/);
  });

  it("performs no file writes", async () => {
    const spies = [
      vi.spyOn(fs.promises, "writeFile"),
      vi.spyOn(fs, "writeFileSync"),
      vi.spyOn(fs.promises, "mkdtemp"),
    ];
    const d = deps();
    const source = encrypt("top-secret", "pw");
    const session = await openEdit(source, undefined, d);
    await saveEdit(session, "changed", source, d);
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });
});

// #AVE-0008
describe("edit a single block", () => {
  const find = (text: string, path: string) =>
    inlineTargets(text).targets.find((t) => t.path === path)!;

  it("opens the block's value and rewrites only that block", async () => {
    const d = deps();
    const source = withBlocks();
    const two = find(source, "a.two");
    const session = await openEdit(source, two.start + 3, d);
    expect(session.kind).toBe("block");
    expect(session.path).toBe("a.two");
    expect(session.plaintext.toString()).toBe("second");
    expect(session.vaultId).toBe("prod");

    const saved = await saveEdit(session, "changed", source, d);
    if (saved.conflict) throw new Error("conflict");
    const out = saved.newSourceText;
    expect(find(out, "a.one").ciphertext).toBe(find(source, "a.one").ciphertext);
    expect(out.startsWith("# keep\na:\n  one: !vault |")).toBe(true);
    expect(out.endsWith("z: 1\n")).toBe(true);
    const newBlock = find(out, "a.two");
    expect(newBlock.vaultId).toBe("prod");
    expect(decrypt(newBlock.ciphertext!, "pw").plaintext.toString()).toBe("changed");
    expect(yamlParse(out, { logLevel: "silent" }).z).toBe(1);
  });

  it("keeps CRLF", async () => {
    const d = deps();
    const source = withBlocks("\r\n");
    const one = find(source, "a.one");
    const session = await openEdit(source, one.start + 3, d);
    const saved = await saveEdit(session, "again", source, d);
    if (saved.conflict) throw new Error("conflict");
    expect(saved.newSourceText.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("a removed block fails clearly", async () => {
    const d = deps();
    const source = withBlocks();
    const session = await openEdit(source, find(source, "a.two").start + 3, d);
    const gone = source.replace(/  two: !vault[\s\S]*?\nz: 1\n/, "z: 1\n");
    const resession = { ...session, sourceHash: hashText(gone) };
    await expect(saveEdit(resession, "x", gone, d)).rejects.toThrow(/a\.two/);
  });

  it("offset outside any block falls back to nothing-to-decrypt", async () => {
    const source = withBlocks();
    await expect(openEdit(source, source.indexOf("z: 1"), deps())).rejects.toThrow(RefusedError);
  });
});

// #AVE-0008
describe("conflicts with the source on disk", () => {
  it("a changed source is a conflict; overwrite proceeds", async () => {
    const d = deps();
    const source = encrypt("a", "pw");
    const session = await openEdit(source, undefined, d);
    const changed = encrypt("someone else", "pw");
    expect(await saveEdit(session, "mine", changed, d)).toEqual({
      conflict: true,
      reason: "changed",
    });
    const forced = await saveEdit(session, "mine", changed, d, { overwrite: true });
    if (forced.conflict) throw new Error("still conflict");
    expect(decrypt(forced.newSourceText, "pw").plaintext.toString()).toBe("mine");
  });

  it("returns the new source hash so the next save compares against it", async () => {
    const d = deps();
    const source = encrypt("a", "pw");
    const session = await openEdit(source, undefined, d);
    const saved = await saveEdit(session, "b", source, d);
    if (saved.conflict) throw new Error("conflict");
    expect(saved.newSourceHash).toBe(hashText(saved.newSourceText));
  });
});
