import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { MAX_SCAN, detectEol, errorMessage, hashText, lineEnd, lineStart } from "../../src/util";

// #AVE-0001, #AVE-0008
describe("detectEol", () => {
  it("is CRLF when any CRLF is present (mixed included)", () => {
    expect(detectEol("a\r\nb\r\n")).toBe("\r\n");
    expect(detectEol("a\nb\r\n")).toBe("\r\n");
  });
  it("is LF for LF-only or no line breaks", () => {
    expect(detectEol("a\nb\n")).toBe("\n");
    expect(detectEol("abc")).toBe("\n");
    expect(detectEol("")).toBe("\n");
  });
});

// #AVE-0005
describe("errorMessage", () => {
  it("uses Error.message, else String()", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage("plain")).toBe("plain");
    expect(errorMessage(42)).toBe("42");
  });
});

// #AVE-0008, #AVE-0013
describe("hashText", () => {
  it("is sha256 hex of the text", () => {
    expect(hashText("a\r\nb")).toBe(createHash("sha256").update("a\r\nb", "utf8").digest("hex"));
  });
  it("optionally normalises CRLF first", () => {
    expect(hashText("a\r\nb", true)).toBe(hashText("a\nb"));
    expect(hashText("a\r\nb")).not.toBe(hashText("a\nb"));
  });
});

// #AVE-0013
describe("line helpers", () => {
  it("lineStart is the offset after the previous newline", () => {
    expect(lineStart("ab\ncd", 0)).toBe(0);
    expect(lineStart("ab\ncd", 4)).toBe(3);
    expect(lineStart("ab\ncd", 3)).toBe(3);
  });
  it("lineEnd stops before LF and CR", () => {
    expect(lineEnd("ab\r\ncd", 0)).toBe(2);
    expect(lineEnd("ab\ncd", 0)).toBe(2);
    expect(lineEnd("ab\ncd", 3)).toBe(5);
  });
});

// #AVE-0001
describe("MAX_SCAN", () => {
  it("is one million characters", () => expect(MAX_SCAN).toBe(1_000_000));
});
