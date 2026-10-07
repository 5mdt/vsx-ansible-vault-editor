import { hasVaulted, plainView } from "../../src/diff/plain";
import { SLOW, nativeDecrypt, stubDecrypt, suite, vaultFile, yamlWithBlocks } from "./corpus";

const file = vaultFile(4096);
const few = yamlWithBlocks(100, 10);
const many = yamlWithBlocks(5000, 500);

// #AVE-0015, #AVE-0018
suite("hasVaulted", [
  ["vaulted file", () => hasVaulted(file)],
  ["10 blocks", () => hasVaulted(few)],
  ["500 blocks", () => hasVaulted(many)],
]);

// #AVE-0015, #AVE-0018
suite("plainView", [
  ["vaulted file, stub crypto", () => plainView(file, stubDecrypt, "throw")],
  ["10 blocks, stub crypto", () => plainView(few, stubDecrypt, "throw")],
  ["500 blocks, stub crypto", () => plainView(many, stubDecrypt, "throw")],
  ["vaulted file", () => plainView(file, nativeDecrypt, "throw"), SLOW],
  ["10 blocks", () => plainView(few, nativeDecrypt, "throw"), SLOW],
]);
