import { describe, expect, it } from "vitest";
import { COMMAND_IDS } from "../../src/commands/ids";
import pkg from "../../package.json";

// #AVE-0014
describe("command ids", () => {
  it("package.json contributes.commands match the handled ids exactly", () => {
    const contributed = pkg.contributes.commands.map((c) => c.command);
    expect([...contributed].sort()).toEqual([...COMMAND_IDS].sort());
  });

  it("has no duplicates", () => {
    expect(new Set(COMMAND_IDS).size).toBe(COMMAND_IDS.length);
  });
});
