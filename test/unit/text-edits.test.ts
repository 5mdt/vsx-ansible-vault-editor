import { describe, expect, it } from "vitest";
import { applyTextEdits } from "../../src/inline/edits";

describe("applyTextEdits", () => {
  // #AVE-0006, #AVE-0008, #AVE-0009, #AVE-0013, #AVE-0015
  it("returns the text unchanged for an empty list", () => {
    expect(applyTextEdits("abc", [])).toBe("abc");
  });

  // #AVE-0006, #AVE-0008, #AVE-0009, #AVE-0013, #AVE-0015
  it("applies a single edit", () => {
    expect(applyTextEdits("hello world", [{ start: 6, end: 11, newText: "there" }])).toBe(
      "hello there",
    );
  });

  // #AVE-0006, #AVE-0008, #AVE-0009, #AVE-0013, #AVE-0015
  it("is independent of input order", () => {
    const a = { start: 0, end: 1, newText: "X" };
    const b = { start: 4, end: 5, newText: "Y" };
    const c = { start: 8, end: 9, newText: "Z" };
    const want = "Xbcd" + "Y" + "fgh" + "Z";
    expect(applyTextEdits("abcdefghi", [a, b, c])).toBe(want);
    expect(applyTextEdits("abcdefghi", [c, a, b])).toBe(want);
    expect(applyTextEdits("abcdefghi", [c, b, a])).toBe(want);
  });

  // #AVE-0006, #AVE-0008, #AVE-0009, #AVE-0013, #AVE-0015
  it("handles adjacent edits", () => {
    const edits = [
      { start: 2, end: 4, newText: "B" },
      { start: 0, end: 2, newText: "A" },
    ];
    expect(applyTextEdits("aabb", edits)).toBe("AB");
  });

  // #AVE-0006, #AVE-0008, #AVE-0009, #AVE-0013, #AVE-0015
  it("handles replacements shorter and longer than the range", () => {
    const edits = [
      { start: 0, end: 4, newText: "x" },
      { start: 5, end: 6, newText: "longer text" },
    ];
    expect(applyTextEdits("abcd e f", edits)).toBe("x" + " " + "longer text" + " f");
  });

  // #AVE-0006, #AVE-0008, #AVE-0009, #AVE-0013, #AVE-0015
  it("supports pure insertions and deletions", () => {
    expect(applyTextEdits("abc", [{ start: 1, end: 1, newText: "-" }])).toBe("a-bc");
    expect(applyTextEdits("abc", [{ start: 1, end: 2, newText: "" }])).toBe("ac");
  });

  // #AVE-0006, #AVE-0008, #AVE-0009, #AVE-0013, #AVE-0015
  it("does not mutate the input array", () => {
    const edits = [
      { start: 2, end: 3, newText: "B" },
      { start: 0, end: 1, newText: "A" },
    ];
    const copy = edits.map((e) => ({ ...e }));
    applyTextEdits("abc", edits);
    expect(edits).toEqual(copy);
  });
});
