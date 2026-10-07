import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  VaultAuthError,
  VaultFormatError,
  decrypt,
  decryptAsync,
  encryptAsync,
  encrypt,
  parseEnvelope,
} from "../../src/vault/format";

const PASSWORD = "test-password";
const fixtures = join(__dirname, "..", "fixtures", "vault");

const payloads: [string, Buffer][] = [
  ["empty", Buffer.alloc(0)],
  ["one byte", Buffer.from("x")],
  ["16 bytes", Buffer.alloc(16, "a")],
  ["32 bytes", Buffer.alloc(32, "b")],
  ["5 KB", Buffer.alloc(5 * 1024, "c")],
];
const variants: [string, string | undefined][] = [
  ["1.1", undefined],
  ["1.2", "prod"],
];

/** Flip one hex digit of the outer-hex body at the given inner byte offset. */
function tamper(text: string, part: "hmac" | "ciphertext"): string {
  const lines = text.trim().split(/\r?\n/);
  const header = lines[0];
  const inner = Buffer.from(lines.slice(1).join(""), "hex").toString("utf8").split("\n");
  const idx = part === "hmac" ? 1 : 2;
  const hex = inner[idx];
  inner[idx] = (hex[0] === "0" ? "1" : "0") + hex.slice(1);
  const body = Buffer.from(inner.join("\n"), "utf8").toString("hex");
  return [header, ...(body.match(/.{1,80}/g) ?? [])].join("\n") + "\n";
}

function rewrap(header: string, innerLines: string[]): string {
  const body = Buffer.from(innerLines.join("\n"), "utf8").toString("hex");
  return [header, ...(body.match(/.{1,80}/g) ?? [])].join("\n") + "\n";
}

// AVE-0001
describe("vault round-trip", () => {
  for (const [version, vaultId] of variants) {
    for (const [name, data] of payloads) {
      it(`${version} / ${name}`, () => {
        const text = encrypt(data, PASSWORD, { vaultId });
        const out = decrypt(text, PASSWORD);
        expect(out.plaintext.equals(data)).toBe(true);
        expect(out.vaultId).toBe(vaultId);
      });
    }
  }

  it("accepts string plaintext", () => {
    const text = encrypt("héllo\n", PASSWORD);
    expect(decrypt(text, PASSWORD).plaintext.toString("utf8")).toBe("héllo\n");
  });
});

// AVE-0001
describe("vault envelope shape", () => {
  it("1.1 header has no vault id", () => {
    expect(encrypt("a", PASSWORD).split("\n")[0]).toBe("$ANSIBLE_VAULT;1.1;AES256");
  });

  it("1.2 header carries the vault id", () => {
    expect(encrypt("a", PASSWORD, { vaultId: "prod" }).split("\n")[0]).toBe(
      "$ANSIBLE_VAULT;1.2;AES256;prod",
    );
  });

  it("wraps body at 80 characters, hex only", () => {
    const lines = encrypt(Buffer.alloc(2000, "z"), PASSWORD).trim().split("\n").slice(1);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) {
      expect(l.length).toBeLessThanOrEqual(80);
      expect(l).toMatch(/^[0-9a-f]+$/);
    }
  });

  it("uses a fresh salt every time", () => {
    const a = parseEnvelope(encrypt("same", PASSWORD));
    const b = parseEnvelope(encrypt("same", PASSWORD));
    expect(a.salt).toHaveLength(32);
    expect(a.salt.equals(b.salt)).toBe(false);
  });

  it("parses header fields", () => {
    const env = parseEnvelope(encrypt("a", PASSWORD, { vaultId: "prod" }));
    expect(env.version).toBe("1.2");
    expect(env.cipher).toBe("AES256");
    expect(env.vaultId).toBe("prod");
  });
});

// AVE-0001
describe("known-answer vectors from ansible-vault", () => {
  const names = readdirSync(fixtures)
    .filter((f) => f.endsWith(".vault"))
    .map((f) => f.replace(/\.vault$/, ""));

  it("has fixtures", () => {
    expect(names.length).toBeGreaterThanOrEqual(4);
  });

  it.each(names)("%s", (name) => {
    const text = readFileSync(join(fixtures, `${name}.vault`), "utf8");
    const expected = readFileSync(join(fixtures, `${name}.txt`));
    const out = decrypt(text, PASSWORD);
    expect(out.plaintext.equals(expected)).toBe(true);
  });

  it("with-id fixture reports its vault id", () => {
    const text = readFileSync(join(fixtures, "with-id.vault"), "utf8");
    expect(decrypt(text, PASSWORD).vaultId).toBe("prod");
  });
});

// AVE-0001
describe("authentication failures", () => {
  const text = () => encrypt("secret", PASSWORD);

  it("wrong password", () => {
    expect(() => decrypt(text(), "nope")).toThrow(VaultAuthError);
  });

  it("tampered ciphertext", () => {
    expect(() => decrypt(tamper(text(), "ciphertext"), PASSWORD)).toThrow(VaultAuthError);
  });

  it("tampered HMAC", () => {
    expect(() => decrypt(tamper(text(), "hmac"), PASSWORD)).toThrow(VaultAuthError);
  });

  it("message names both causes", () => {
    expect(() => decrypt(text(), "nope")).toThrow(/wrong password or corrupted vault/);
  });

  it("is not a format error", () => {
    try {
      decrypt(text(), "nope");
      expect.unreachable();
    } catch (e) {
      expect(e).not.toBeInstanceOf(VaultFormatError);
    }
  });
});

// AVE-0001
describe("malformed envelopes", () => {
  const valid = () => encrypt("secret", PASSWORD);
  const code = (fn: () => unknown) => {
    try {
      fn();
    } catch (e) {
      return e instanceof VaultFormatError ? e.code : `other:${e}`;
    }
    return "no error";
  };

  it("garbage header", () => {
    expect(code(() => decrypt("not a vault\nabcd\n", PASSWORD))).toBe("header");
  });

  it("empty input", () => {
    expect(code(() => decrypt("", PASSWORD))).toBe("header");
  });

  it("unknown version", () => {
    const t = valid().replace("1.1", "9.9");
    expect(code(() => decrypt(t, PASSWORD))).toBe("header");
  });

  it("odd hex length", () => {
    const lines = valid().trim().split("\n");
    lines[1] = lines[1] + "a";
    expect(code(() => decrypt(lines.join("\n"), PASSWORD))).toBe("hex");
  });

  it("non-hex body", () => {
    const t = "$ANSIBLE_VAULT;1.1;AES256\nzzzz\n";
    expect(code(() => decrypt(t, PASSWORD))).toBe("hex");
  });

  it("unknown cipher", () => {
    const t = valid().replace("AES256", "AES128");
    expect(code(() => decrypt(t, PASSWORD))).toBe("cipher");
  });

  it("missing inner parts", () => {
    const t = rewrap("$ANSIBLE_VAULT;1.1;AES256", ["aa", "bb"]);
    expect(code(() => decrypt(t, PASSWORD))).toBe("body");
  });

  it("header only", () => {
    expect(code(() => decrypt("$ANSIBLE_VAULT;1.1;AES256\n", PASSWORD))).toBe("body");
  });
});

// AVE-0001
describe("vault id validation", () => {
  it.each(["a;b", "a b", "a\nb", "a\tb"])("rejects %j on encrypt", (id) => {
    try {
      encrypt("a", PASSWORD, { vaultId: id });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(VaultFormatError);
      expect((e as VaultFormatError).code).toBe("header");
    }
  });
});

// AVE-0001
describe("line endings", () => {
  it("decrypts CRLF-wrapped ciphertext", () => {
    const fixture = readFileSync(join(fixtures, "multiline.vault"), "utf8");
    const crlf = fixture.replace(/\r?\n/g, "\r\n");
    const out = decrypt(crlf, PASSWORD);
    expect(out.plaintext.toString("utf8")).toBe(
      readFileSync(join(fixtures, "multiline.txt"), "utf8"),
    );
  });

  it("emits only CRLF when asked", () => {
    const text = encrypt("a", PASSWORD, { eol: "\r\n" });
    expect(text).toMatch(/\r\n/);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("emits only LF by default", () => {
    expect(encrypt("a", PASSWORD)).not.toMatch(/\r/);
  });

  it("keeps plaintext EOLs as-is inside the payload", () => {
    const data = "a\r\nb\n";
    const text = encrypt(data, PASSWORD, { eol: "\r\n" });
    expect(decrypt(text, PASSWORD).plaintext.toString("utf8")).toBe(data);
  });
});

// #BUG-0008, #AVE-0001
describe("async crypto", () => {
  it("encryptAsync output decrypts with the sync and async paths", async () => {
    const salt = Buffer.alloc(32, 7);
    const text = await encryptAsync("hello", "pw", { vaultId: "prod", salt });
    expect(text).toBe(encrypt("hello", "pw", { vaultId: "prod", salt }));
    expect(decrypt(text, "pw").plaintext.toString()).toBe("hello");
    const out = await decryptAsync(text, "pw");
    expect(out.plaintext.toString()).toBe("hello");
    expect(out.vaultId).toBe("prod");
  });

  it("decryptAsync rejects a wrong password with VaultAuthError", async () => {
    const text = await encryptAsync("x", "pw");
    await expect(decryptAsync(text, "nope")).rejects.toBeInstanceOf(VaultAuthError);
  });
});
