import { describe, expect, it } from "vitest";
import { parseMarkers, stripFileMarker, toggleMarkerEdit } from "../../src/transparent/markers";

const apply = (t: string, e: { start: number; end: number; newText: string }) =>
  t.slice(0, e.start) + e.newText + t.slice(e.end);

// #AVE-0013
describe("markers", () => {
  it("parses a file marker with and without id, and strips it", () => {
    const a = parseMarkers("# ansible-vault: encrypt\na: 1\n");
    expect(a.file?.vaultId).toBeUndefined();
    expect(stripFileMarker("# ansible-vault: encrypt\na: 1\n", a.file!)).toBe("a: 1\n");
    const b = parseMarkers("# ansible-vault: encrypt id=prod\r\na: 1\r\n");
    expect(b.file?.vaultId).toBe("prod");
    expect(parseMarkers("# note\na: 1\n").file).toBeUndefined();
  });

  it("parses value markers, ids and ranges", () => {
    const text = "a: 1\npw: s3cret # ansible-vault: encrypt id=prod\nq: \"x # y\"\n";
    const m = parseMarkers(text);
    expect(m.values).toHaveLength(1);
    expect(m.values[0].vaultId).toBe("prod");
    expect(m.values[0].target.value).toBe("s3cret");
    expect(text.slice(m.values[0].start, m.values[0].end)).toBe("s3cret # ansible-vault: encrypt id=prod");
  });

  it("finds a marker on a block scalar header", () => {
    const text = "k: |- # ansible-vault: encrypt\n  one\n  two\nz: 1\n";
    const m = parseMarkers(text);
    expect(m.values).toHaveLength(1);
    expect(m.values[0].target.value).toBe("one\ntwo");
    expect(text.slice(m.values[0].end)).toBe("\nz: 1\n");
  });

  it("handles CRLF", () => {
    const m = parseMarkers("a: x # ansible-vault: encrypt\r\nb: 2\r\n");
    expect(m.values).toHaveLength(1);
    expect(m.values[0].end).toBe("a: x # ansible-vault: encrypt".length);
  });

  it("ignores a marker inside a quoted string", () => {
    expect(parseMarkers('a: "x # ansible-vault: encrypt"\n').values).toHaveLength(0);
  });

  it("toggles a value marker on and off, and the file marker", () => {
    let t = "a: 1\npw: s3cret\n";
    t = apply(t, toggleMarkerEdit(t, t.indexOf("s3cret"), "\n")!);
    expect(t).toBe("a: 1\npw: s3cret # ansible-vault: encrypt\n");
    t = apply(t, toggleMarkerEdit(t, t.indexOf("s3cret"), "\n")!);
    expect(t).toBe("a: 1\npw: s3cret\n");
    t = apply(t, toggleMarkerEdit(t, 0, "\n")!);
    expect(t.startsWith("# ansible-vault: encrypt\n")).toBe(true);
    expect(apply(t, toggleMarkerEdit(t, 0, "\n")!)).toBe("a: 1\npw: s3cret\n");
  });
});
