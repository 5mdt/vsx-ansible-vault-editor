import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const doc = readFileSync(
  join(root, "docs/features/AVE-0014-keybindings.md"),
  "utf8",
);

// First column of the command table in the feature doc is the contract.
const documented = [...doc.matchAll(/^\| `(ansibleVault\.[A-Za-z]+)`/gm)].map(
  (m) => m[1],
);
const contributed: { command: string; title?: string }[] =
  pkg.contributes.commands;

// AVE-0014
describe("keybindings contract", () => {
  it("documents at least one command", () => {
    expect(documented.length).toBeGreaterThan(0);
  });

  it.each(documented)("%s is contributed with a title", (id) => {
    const entry = contributed.find((c) => c.command === id);
    expect(entry, `${id} missing from package.json`).toBeDefined();
    expect(entry?.title?.trim()).toBeTruthy();
  });

  it("contributes no command missing from the doc table", () => {
    const extra = contributed
      .map((c) => c.command)
      .filter((id) => !documented.includes(id));
    expect(extra).toEqual([]);
  });

  it("contributes no keybindings", () => {
    expect(pkg.contributes.keybindings ?? []).toEqual([]);
  });
});
