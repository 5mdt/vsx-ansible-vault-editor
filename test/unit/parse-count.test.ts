import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
vi.mock("yaml", async (orig) => {
  const real = await orig<typeof import("yaml")>();
  return {
    ...real,
    parseAllDocuments: ((text: string, opts: never) => {
      calls.push(text);
      return real.parseAllDocuments(text, opts);
    }) as typeof real.parseAllDocuments,
  };
});

import { describeDocument, findVaultBlocks } from "../../src/detect";
import { guardReasons, snapshot } from "../../src/guard/snapshot";
import { inlineTargets } from "../../src/inline/yaml-values";
import { parseMarkers, toggleMarkerEdit } from "../../src/transparent/markers";
import { planSave, wholeFile, type SealDeps } from "../../src/transparent/seal";

beforeEach(() => {
  calls.length = 0;
});

const parsesOf = (t: string) => calls.filter((c) => c === t).length;

// #BUG-0007, #AVE-0006
describe("inlineTargets memo", () => {
  it("parses repeated calls on the same text once", () => {
    const t = "memo: 1\n";
    inlineTargets(t);
    inlineTargets(t);
    expect(parsesOf(t)).toBe(1);
  });
});

// #BUG-0007, #AVE-0012
describe("one cursor move", () => {
  it("parses the text once across describe, blocks, markers and providers", () => {
    const t = "a: 1 # ansible-vault: encrypt\nk: !vault |\n  $ANSIBLE_VAULT;1.1;AES256\n  6162\n";
    const s = describeDocument(t, 0);
    expect(s.blocks).toHaveLength(1);
    expect(s.markers?.values).toHaveLength(1);
    findVaultBlocks(t);
    parseMarkers(t);
    expect(parsesOf(t)).toBe(1);
  });
});

// #BUG-0007, #AVE-0011, #AVE-0013
describe("one save", () => {
  const deps: SealDeps = {
    backend: { encrypt: async () => "$ANSIBLE_VAULT;1.1;AES256\n6162\n" } as never,
    defaultVaultId: undefined,
    secretFor: async () => "pw",
    eol: "\n",
  } as never;

  it("parses the saved text once for reasons and plan", async () => {
    const t = "a: 1\nb: 2 # ansible-vault: encrypt\n";
    const snap = snapshot("a: 1\nb: 2\n");
    calls.length = 0;
    guardReasons(t, snap, false);
    wholeFile(t, snap, false);
    await planSave(t, snap, false, new Map(), deps).catch(() => undefined);
    expect(parsesOf(t)).toBe(1);
  });

  it("toggleMarkerEdit parses once", () => {
    const t = "x: 1\n";
    toggleMarkerEdit(t, 3, "\n");
    expect(parsesOf(t)).toBe(1);
  });
});
