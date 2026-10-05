import { describe, expect, it } from "vitest";
import { hoverMarkdown, peekQuiet, peekTarget } from "../../src/peek/peek";
import { SecretResolver, type SecretStore } from "../../src/secrets/resolver";
import { NativeBackend } from "../../src/vault/backend";
import { encrypt } from "../../src/vault/format";

class MemStore implements SecretStore {
  data = new Map<string, string>();
  get = async (id: string) => this.data.get(id);
  set = async (id: string, s: string) => void this.data.set(id, s);
  delete = async (id: string) => void this.data.delete(id);
  ids = async () => [...this.data.keys()];
}

function deps(keychain: Record<string, string>) {
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
      prompt: async () => {
        throw new Error("peek must never prompt on its own");
      },
    }),
  };
}

function block(plain: string, pw = "pw"): string {
  const cipher = encrypt(plain, pw).trimEnd().split("\n");
  return `k: !vault |\n${cipher.map((l) => "  " + l).join("\n")}\nother: 1\n`;
}

// #AVE-0007
describe("peek target", () => {
  it("plain text -> nothing", () => {
    expect(peekTarget("a: 1\n", 2)).toBeUndefined();
  });

  it("a block under the offset", () => {
    const text = block("secret");
    const t = peekTarget(text, text.indexOf("$ANSIBLE") + 3)!;
    expect(t.kind).toBe("block");
    expect(t.ciphertext).toContain("$ANSIBLE_VAULT;1.1;AES256");
  });

  it("an offset outside any block -> nothing", () => {
    const text = block("secret");
    expect(peekTarget(text, text.indexOf("other"))).toBeUndefined();
  });

  it("a vaulted file: anywhere for the command, header line only for the hover", () => {
    const file = encrypt("a: 1\n", "pw");
    expect(peekTarget(file, file.length - 3)!.kind).toBe("file");
    expect(peekTarget(file, file.length - 3, { headerOnly: true })).toBeUndefined();
    expect(peekTarget(file, 3, { headerOnly: true })!.kind).toBe("file");
  });
});

// #AVE-0007
describe("peek without prompting", () => {
  it("decrypts a block with a known secret", async () => {
    const text = block("s3cret");
    const out = await peekQuiet(text, text.indexOf("$ANSIBLE"), deps({ default: "pw" }));
    expect(out).toMatchObject({ state: "ok", plaintext: "s3cret" });
  });

  it("decrypts a whole vaulted file", async () => {
    const out = await peekQuiet(encrypt("a: 1\n", "pw"), 0, deps({ default: "pw" }));
    expect(out).toMatchObject({ state: "ok", plaintext: "a: 1\n" });
  });

  it("no secret configured -> no-secret", async () => {
    const text = block("s3cret");
    expect(await peekQuiet(text, text.indexOf("$ANSIBLE"), deps({}))).toEqual({
      state: "no-secret",
    });
  });

  it("wrong secret -> wrong", async () => {
    const text = block("s3cret");
    expect(
      await peekQuiet(text, text.indexOf("$ANSIBLE"), deps({ default: "nope" })),
    ).toEqual({ state: "wrong" });
  });

  it("malformed envelope -> nothing", async () => {
    const text = "k: !vault |\n  $ANSIBLE_VAULT;1.1;AES256\n  zz\n";
    expect(await peekQuiet(text, text.indexOf("$ANSIBLE"), deps({ default: "pw" }))).toBeUndefined();
  });

  it("plain text -> nothing", async () => {
    expect(await peekQuiet("a: 1\n", 1, deps({ default: "pw" }))).toBeUndefined();
  });

  it("multi-line values come back intact", async () => {
    const text = block("line one\nline two\n");
    const out = await peekQuiet(text, text.indexOf("$ANSIBLE"), deps({ default: "pw" }));
    expect(out).toMatchObject({ plaintext: "line one\nline two\n" });
  });
});

// #AVE-0007
describe("hover markdown", () => {
  it("wraps in a code fence", () => {
    expect(hoverMarkdown("s3cret")).toBe("```\ns3cret\n```");
  });

  it.each(["has ``` fence", "four ```` ticks", "`single`", "```\nstart"])(
    "fence outlasts backticks in %j",
    (value) => {
      const md = hoverMarkdown(value);
      const fence = /^`+/.exec(md)![0];
      const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((r) => r.length));
      expect(fence.length).toBeGreaterThan(longest);
      expect(fence.length).toBeGreaterThanOrEqual(3);
      expect(md.endsWith("\n" + fence)).toBe(true);
      expect(md).toContain(value);
    },
  );
});
