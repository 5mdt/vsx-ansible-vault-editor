import { describe, expect, it } from "vitest";
import {
  decideSave,
  guardAction,
  guardButtons,
  guardReasons,
  snapshot,
} from "../../src/guard/snapshot";
import { encrypt } from "../../src/vault/format";

const block = (plain: string) =>
  `k: !vault |\n${encrypt(plain, "pw")
    .trimEnd()
    .split("\n")
    .map((l) => "  " + l)
    .join("\n")}\n`;

// #AVE-0011
describe("save guard", () => {
  it("is quiet for an ordinary plain file", () => {
    expect(guardReasons("a: 1\n", snapshot("a: 1\n"), false)).toEqual([]);
  });

  it("guards a file that was vaulted and is now plaintext", () => {
    const snap = snapshot(encrypt("a: 1\n", "pw"));
    expect(guardReasons("a: 1\n", snap, false)).toEqual(["was-vaulted"]);
    expect(guardReasons(encrypt("a: 1\n", "pw"), snap, false)).toEqual([]);
  });

  it("guards a decrypted block but not a still-encrypted one", () => {
    const text = block("s3cret");
    const snap = snapshot(text);
    expect(guardReasons(text, snap, false)).toEqual([]);
    expect(guardReasons("k: s3cret\n", snap, false)).toEqual(["was-vaulted"]);
    expect(guardReasons("other: 1\n", snap, false)).toEqual([]);
  });

  it("guards by glob and by marker", () => {
    expect(guardReasons("a: 1\n", snapshot("a: 1\n"), true)).toEqual(["glob"]);
    expect(guardReasons("a: 1 # ansible-vault: encrypt\n", snapshot("a: 1\n"), false)).toEqual([
      "marker",
    ]);
    expect(guardReasons("# ansible-vault: encrypt\na: 1\n", snapshot("a: 1\n"), false)).toEqual([
      "marker",
    ]);
  });

  it("maps the setting to an action and buttons", () => {
    expect(guardAction(["glob"], "off")).toBe("save");
    expect(guardAction(["glob"], "warn")).toBe("dialog");
    expect(guardAction(["glob"], "block")).toBe("dialog");
    expect(guardAction([], "block")).toBe("save");
    expect(guardButtons("warn")).toContain("Save anyway");
    expect(guardButtons("block")).not.toContain("Save anyway");
  });

  it("a marked item is covered, a removed marker is not", () => {
    const text = block("s3cret");
    const snap = snapshot(text);
    expect(guardReasons("k: s3cret # ansible-vault: encrypt\n", snap, false)).toEqual(["marker"]);
    expect(
      guardReasons(
        "# ansible-vault: encrypt\nk: s3cret\n",
        snapshot(encrypt("k: s3cret\n", "pw")),
        true,
      ),
    ).toEqual(["marker"]);
  });

  it("decides: transparent encrypts markers silently, otherwise the dialog", () => {
    expect(decideSave(["marker"], "warn", true)).toBe("encrypt");
    expect(decideSave(["marker"], "warn", false)).toBe("dialog");
    expect(decideSave(["marker"], "off", false)).toBe("save");
    expect(decideSave(["was-vaulted", "marker"], "block", true)).toBe("dialog");
    expect(decideSave(["glob"], "warn", true)).toBe("dialog");
    expect(decideSave([], "block", true)).toBe("save");
  });
});
