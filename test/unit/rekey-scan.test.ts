import { describe, expect, it } from "vitest";
import { excludeGlob, filterById, idCounts, previewTitle, scanText } from "../../src/rekey/scan";
import { encrypt } from "../../src/vault/format";

const block = (key: string, id?: string) =>
  `${key}: !vault |\n${encrypt("x", "pw", { vaultId: id }).trimEnd().split("\n").map((l) => "  " + l).join("\n")}\n`;

// #AVE-0010
describe("rekey scan", () => {
  it("classifies files, mixed files and plain files", () => {
    expect(scanText("a: 1\n")).toBeUndefined();
    expect(scanText(encrypt("a", "pw", { vaultId: "prod" }))).toEqual({ kind: "file", count: 1, vaultIds: ["prod"] });
    expect(scanText(`a: 1\n${block("x", "dev")}${block("y")}${block("z", "dev")}`)).toEqual({
      kind: "blocks",
      count: 3,
      vaultIds: ["dev", ""],
    });
  });

  it("builds the exclude glob from enabled files.exclude keys and rekeyExclude", () => {
    expect(excludeGlob({}, [])).toBeUndefined();
    expect(excludeGlob({ "**/.git": true, "**/x": false }, [])).toBe("**/.git");
    expect(excludeGlob({ "**/.git": true }, ["vendor/**"])).toBe("{**/.git,vendor/**}");
  });

  it("filters entries by vault ID and counts IDs", () => {
    const a = { entry: scanText(encrypt("a", "pw", { vaultId: "prod" }))! };
    const b = { entry: scanText(block("k", "dev"))! };
    expect(filterById([a, b], "prod")).toEqual([a]);
    expect(filterById([a, b], undefined)).toHaveLength(2);
    expect(idCounts([a.entry, b.entry]).get("dev")).toBe(1);
  });

  it("titles the preview with file and block counts", () => {
    const entries = [
      scanText(encrypt("a", "pw"))!,
      scanText(`${block("a")}${block("b")}`)!,
    ];
    expect(previewTitle(entries)).toBe("Rekey workspace: 2 files, 2 blocks");
  });
});
