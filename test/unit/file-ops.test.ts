import { describe, expect, it } from "vitest";
import { planFile } from "../../src/commands/file-ops";

const plain = "a: 1\n";
const vaulted = "$ANSIBLE_VAULT;1.1;AES256\n6162\n";

// #AVE-0005
describe("file operation plan", () => {
  it.each([
    ["encrypt", plain, "encrypt"],
    ["decrypt", vaulted, "decrypt"],
    ["toggle", plain, "encrypt"],
    ["toggle", vaulted, "decrypt"],
  ] as const)("%s on %j", (op, text, expected) => {
    expect(planFile(text, op)).toBe(expected);
  });

  it("encrypt on a vaulted file is refused", () => {
    expect(planFile(vaulted, "encrypt")).toEqual({ refused: "already encrypted" });
  });

  it("decrypt on a plain file is refused", () => {
    expect(planFile(plain, "decrypt")).toEqual({ refused: "not encrypted" });
  });
});
