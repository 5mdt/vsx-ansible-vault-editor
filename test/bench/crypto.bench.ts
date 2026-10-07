import { NativeBackend } from "../../src/vault/backend";
import { decrypt, encrypt, parseEnvelope } from "../../src/vault/format";
import { PASSWORD, payload, suite, vaultFile, type Case } from "./corpus";

const backend = new NativeBackend();
const sizes: [string, number][] = [
  ["0 B", 0],
  ["1 KB", 1024],
  ["64 KB", 64 * 1024],
  ["1 MB", 1024 * 1024],
];

const format: Case[] = sizes.flatMap(([label, bytes]): Case[] => {
  const data = payload(bytes);
  const sealed = vaultFile(bytes);
  return [
    [`encrypt ${label}`, () => encrypt(data, PASSWORD)],
    [`decrypt ${label}`, () => decrypt(sealed, PASSWORD)],
    [`parseEnvelope ${label}`, () => parseEnvelope(sealed)],
  ];
});
const v11 = vaultFile(1024);
const v12 = vaultFile(1024, "prod");
format.push(
  ["decrypt 1 KB, 1.1 header", () => decrypt(v11, PASSWORD)],
  ["decrypt 1 KB, 1.2 header", () => decrypt(v12, PASSWORD)],
);

// #AVE-0001, #AVE-0018
suite("format", format);

const data = payload(1024);
const sealed = vaultFile(1024);
// #AVE-0002, #AVE-0018
suite("native backend", [
  ["encrypt 1 KB", () => backend.encrypt(data, PASSWORD)],
  ["decrypt 1 KB", () => backend.decrypt(sealed, PASSWORD)],
]);
