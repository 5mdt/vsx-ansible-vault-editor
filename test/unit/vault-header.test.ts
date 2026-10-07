import { describe, expect, it } from "vitest";
import { VaultFormatError, readHeader } from "../../src/vault/format";
import { DEFAULT_LABEL, hasVaultMagic, parseHeader } from "../../src/vault/header";

describe("parseHeader", () => {
  // #AVE-0001
  it("parses a 1.1 header without a vault id", () => {
    expect(parseHeader("$ANSIBLE_VAULT;1.1;AES256\n6162")).toEqual({
      version: "1.1",
      cipher: "AES256",
      vaultId: undefined,
      wellFormed: true,
    });
  });

  // #AVE-0001, #AVE-0004
  it("parses a 1.2 header with a vault id", () => {
    expect(parseHeader("$ANSIBLE_VAULT;1.2;AES256;prod\n6162")).toEqual({
      version: "1.2",
      cipher: "AES256",
      vaultId: "prod",
      wellFormed: true,
    });
  });

  // #AVE-0001
  it("accepts CRLF and surrounding whitespace", () => {
    expect(parseHeader("$ANSIBLE_VAULT;1.2;AES256;dev \r\n6162")?.vaultId).toBe("dev");
  });

  // #AVE-0001
  it("flags a wrong field count as not well formed", () => {
    expect(parseHeader("$ANSIBLE_VAULT;1.2;AES256")?.wellFormed).toBe(false);
    expect(parseHeader("$ANSIBLE_VAULT;1.1;AES256;x")?.wellFormed).toBe(false);
  });

  // #AVE-0001
  it("returns undefined for malformed headers", () => {
    for (const bad of [
      "",
      "hello",
      "$ANSIBLE_VAULT",
      "$ANSIBLE_VAULT;2.0;AES256",
      "$ANSIBLE_VAULT;1.1",
    ]) {
      expect(parseHeader(bad)).toBeUndefined();
    }
  });

  // #AVE-0012
  it("hasVaultMagic matches the prefix even when the header is invalid", () => {
    expect(hasVaultMagic("$ANSIBLE_VAULT;9.9;x\n")).toBe(true);
    expect(hasVaultMagic("---\n$ANSIBLE_VAULT;1.1;AES256")).toBe(false);
  });

  // #AVE-0001, #AVE-0004
  it("readHeader throws a header VaultFormatError", () => {
    expect(() => readHeader("nope")).toThrow(VaultFormatError);
    expect(readHeader("$ANSIBLE_VAULT;1.1;AES256").vaultId ?? DEFAULT_LABEL).toBe("default");
  });
});
