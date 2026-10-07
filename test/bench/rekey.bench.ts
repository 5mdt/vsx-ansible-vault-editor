import { rekeyMany, rekeyText, type RekeyDeps } from "../../src/rekey/rekey";
import type { VaultBackend } from "../../src/vault/backend";
import {
  SLOW,
  nativeBackend,
  nativeDecrypt,
  stubDecrypt,
  suite,
  vaultFile,
  yamlWithBlocks,
} from "./corpus";

const target = { vaultId: "prod", secret: "new-password" };
const real: RekeyDeps = { backend: nativeBackend, decrypt: nativeDecrypt };
const stubBackend: VaultBackend = {
  encrypt: async () => "$ANSIBLE_VAULT;1.2;AES256;prod\n6162\n",
  decrypt: async () => ({ plaintext: Buffer.from("x") }),
  rekey: async () => "",
};
const stub: RekeyDeps = { backend: stubBackend, decrypt: stubDecrypt };

const file = vaultFile(1024);
const many = yamlWithBlocks(500, 50);
// #AVE-0009, #AVE-0018
suite("rekeyText", [
  ["vaulted file", () => rekeyText(file, target, real), SLOW],
  ...[1, 10, 50].map((n): [string, () => unknown, typeof SLOW] => {
    const text = yamlWithBlocks(n * 10, n);
    return [`${n} blocks`, () => rekeyText(text, target, real), SLOW];
  }),
  ["50 blocks, stub crypto", () => rekeyText(many, target, stub)],
]);

const files = Array.from({ length: 20 }, (_, i) => ({ id: `f${i}`, text: yamlWithBlocks(100, 5) }));
// #AVE-0010, #AVE-0018
suite("rekeyMany", [
  ["20 files x 5 blocks, stub crypto", () => rekeyMany(files, target, stub)],
  ["20 files x 5 blocks", () => rekeyMany(files, target, real), SLOW],
]);
