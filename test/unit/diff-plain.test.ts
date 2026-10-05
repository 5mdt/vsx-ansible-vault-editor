import { describe, expect, it } from "vitest";
import { hasVaulted, plainView, type DecryptFn } from "../../src/diff/plain";
import { decrypt, encrypt } from "../../src/vault/format";

const open: DecryptFn = async (c) => decrypt(c, "pw");
const wrong: DecryptFn = async (c) => decrypt(c, "other");
const block = (key: string, plain: string, eol = "\n") =>
  `${key}: !vault |${eol}${encrypt(plain, "pw", { eol: "\n" }).trimEnd().split("\n").map((l) => "  " + l).join(eol)}${eol}`;

// #AVE-0015
describe("plain view", () => {
  it("shows a vaulted file as its plaintext", async () => {
    expect(await plainView(encrypt("a: 1\n", "pw"), open, "throw")).toBe("a: 1\n");
  });

  it("replaces blocks with their values and keeps the rest", async () => {
    const text = `head: 1\n${block("one", "first")}${block("two", "second")}tail: 2\n`;
    expect(await plainView(text, open, "throw")).toBe("head: 1\none: first\ntwo: second\ntail: 2\n");
  });

  it("handles multi-line values and CRLF", async () => {
    const text = `a: 1\r\n${block("m", "line one\nline two", "\r\n")}z: 2\r\n`;
    const out = await plainView(text, open, "throw");
    expect(out).toBe("a: 1\r\nm: |-\r\n  line one\r\n  line two\r\nz: 2\r\n");
  });

  it("throw fails the view, keep leaves the item as it was", async () => {
    const text = `a: 1\n${block("one", "first")}`;
    await expect(plainView(text, wrong, "throw")).rejects.toThrow();
    expect(await plainView(text, wrong, "keep")).toBe(text);
    const file = encrypt("a: 1\n", "pw");
    expect(await plainView(file, wrong, "keep")).toBe(file);
  });

  it("passes plain text through and reports whether there is anything vaulted", async () => {
    expect(await plainView("a: 1\n", open, "throw")).toBe("a: 1\n");
    expect(hasVaulted("a: 1\n")).toBe(false);
    expect(hasVaulted(encrypt("x", "pw"))).toBe(true);
    expect(hasVaulted(block("k", "v"))).toBe(true);
  });
});
