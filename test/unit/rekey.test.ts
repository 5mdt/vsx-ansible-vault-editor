import { describe, expect, it } from "vitest";
import { findVaultBlocks } from "../../src/detect";
import { itemsIn, rekeyText, selectBlocks, type RekeyDeps } from "../../src/rekey/rekey";
import { NativeBackend } from "../../src/vault/backend";
import { decrypt, encrypt, parseEnvelope, VaultAuthError } from "../../src/vault/format";

const backend = new NativeBackend();
const deps = (password = "old"): RekeyDeps => ({
  backend,
  decrypt: async (c) => ({ ...(await backend.decrypt(c, password)), secret: password }),
});

function blocks(entries: [string, string, string?][], eol: "\n" | "\r\n" = "\n"): string {
  const body = entries.map(([key, plain, id]) => {
    const lines = encrypt(plain, "old", { vaultId: id, eol: "\n" }).trimEnd().split("\n");
    return `${key}: !vault |\n${lines.map((l) => "  " + l).join("\n")}`;
  });
  return ["head: 1", ...body, "tail: 2", ""].join("\n").replace(/\n/g, eol);
}

// #AVE-0009
describe("rekey", () => {
  it("rekeys a vaulted file: new password opens it, old does not, ID changes", async () => {
    const source = encrypt("a: 1\n", "old", { vaultId: "dev" });
    const out = await rekeyText(source, { vaultId: "prod", secret: "new" }, deps());
    expect(out.count).toBe(1);
    expect(parseEnvelope(out.text).vaultId).toBe("prod");
    expect(decrypt(out.text, "new").plaintext.toString()).toBe("a: 1\n");
    expect(() => decrypt(out.text, "old")).toThrow(VaultAuthError);
  });

  it("can drop the ID", async () => {
    const out = await rekeyText(encrypt("x", "old", { vaultId: "dev" }), { secret: "new" }, deps());
    expect(parseEnvelope(out.text).vaultId).toBeUndefined();
  });

  it("rekeys every block and leaves other lines alone", async () => {
    const source = blocks([["one", "first"], ["two", "second", "dev"], ["three", "third"]]);
    const out = await rekeyText(source, { vaultId: "prod", secret: "new" }, deps());
    expect(out.count).toBe(3);
    expect(out.text.startsWith("head: 1\none: !vault |")).toBe(true);
    expect(out.text.endsWith("tail: 2\n")).toBe(true);
    const got = findVaultBlocks(out.text);
    expect(got.map((b) => decrypt(b.ciphertext, "new").plaintext.toString())).toEqual(["first", "second", "third"]);
    expect(got.every((b) => b.vaultId === "prod")).toBe(true);
    for (const b of got) expect(() => decrypt(b.ciphertext, "old")).toThrow(VaultAuthError);
  });

  it("one bad block aborts the whole edit", async () => {
    const bad = encrypt("other", "different").trimEnd().split("\n").map((l) => "  " + l).join("\n");
    const source = blocks([["one", "first"]]).replace("tail: 2", `bad: !vault |\n${bad}\ntail: 2`);
    await expect(rekeyText(source, { secret: "new" }, deps())).rejects.toBeInstanceOf(VaultAuthError);
  });

  it("only the selected blocks change", async () => {
    const source = blocks([["one", "first"], ["two", "second"]]);
    const all = findVaultBlocks(source);
    const out = await rekeyText(source, { vaultId: "prod", secret: "new" }, deps(), {
      blocks: (b) => selectBlocks(b, all[1].start + 2, all[1].start + 2),
    });
    expect(out.count).toBe(1);
    const got = findVaultBlocks(out.text);
    expect(got[0].ciphertext).toBe(all[0].ciphertext);
    expect(decrypt(got[1].ciphertext, "new").plaintext.toString()).toBe("second");
  });

  it("selection touching nothing selects all", () => {
    const all = findVaultBlocks(blocks([["one", "a"], ["two", "b"]]));
    expect(selectBlocks(all, 0, 1)).toHaveLength(2);
  });

  it("keeps CRLF", async () => {
    const source = blocks([["one", "first"]], "\r\n");
    const out = await rekeyText(source, { secret: "new" }, deps());
    expect(out.text.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("reports nothing to do for a plain file", async () => {
    expect(itemsIn("a: 1\n").kind).toBe("none");
    expect(await rekeyText("a: 1\n", { secret: "n" }, deps())).toEqual({ text: "a: 1\n", count: 0 });
  });
});
