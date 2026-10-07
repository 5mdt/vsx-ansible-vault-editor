import { describeDocument, fileVaultId, findVaultBlocks } from "../../src/detect";
import { inlineTargets, plainScalars } from "../../src/inline/yaml-values";
import { scanText } from "../../src/rekey/scan";
import { parseMarkers } from "../../src/transparent/markers";
import { fresh, suite, vaultFile, yamlWithBlocks } from "./corpus";

// keys, blocks.
const sizes: [string, number, number][] = [
  ["100 lines", 80, 4],
  ["1k lines", 1000, 10],
  ["4k lines", 4000, 40],
  ["16k lines", 16000, 160],
];

for (const [label, keys, blocks] of sizes) {
  const text = yamlWithBlocks(keys, blocks, { markers: true });
  const mid = Math.floor(text.length / 2);
  // #AVE-0012, #AVE-0006, #AVE-0013, #AVE-0018
  suite(`detection, ${label}`, [
    ["describeDocument", () => describeDocument(fresh(text), mid)],
    ["findVaultBlocks", () => findVaultBlocks(fresh(text))],
    ["inlineTargets", () => inlineTargets(fresh(text))],
    ["plainScalars", () => plainScalars(fresh(text))],
    ["parseMarkers", () => parseMarkers(fresh(text))],
    ["scanText", () => scanText(fresh(text))],
    // #BUG-0007: a cursor move on unchanged text; target is under 20 ms at 4k lines.
    ["describeDocument, cursor move (same text)", () => describeDocument(text, mid)],
  ]);
}

const file = vaultFile(64 * 1024);
// #AVE-0012, #AVE-0018
suite("vaulted file header", [
  ["fileVaultId 64 KB file", () => fileVaultId(file)],
  ["describeDocument 64 KB file", () => describeDocument(file, 0)],
]);
