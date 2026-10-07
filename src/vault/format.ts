// #AVE-0001: ansible-vault envelope format (1.1 / 1.2, AES256).

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  pbkdf2,
  pbkdf2Sync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { VAULT_MAGIC, parseHeader, type VaultHeader } from "./header";

export type VaultVersion = "1.1" | "1.2";

export interface Envelope {
  version: VaultVersion;
  cipher: string;
  vaultId?: string;
  salt: Buffer;
  hmac: Buffer;
  ciphertext: Buffer;
}

export type VaultFormatErrorCode = "header" | "hex" | "cipher" | "body";

export class VaultFormatError extends Error {
  constructor(
    public readonly code: VaultFormatErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VaultFormatError";
  }
}

/** Wrong password or corrupted vault (HMAC mismatch). */
export class VaultAuthError extends Error {
  constructor() {
    super("wrong password or corrupted vault");
    this.name = "VaultAuthError";
  }
}

export interface EncryptOptions {
  vaultId?: string;
  eol?: "\n" | "\r\n";
  salt?: Buffer;
}

const MAGIC = VAULT_MAGIC;
const CIPHER = "AES256";
const ITERATIONS = 10000;
const WRAP = 80;

function strictHex(text: string, what: string): Buffer {
  if (text.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(text)) {
    throw new VaultFormatError("hex", `${what} is not valid hex`);
  }
  return Buffer.from(text, "hex");
}

const pbkdf2Async = promisify(pbkdf2);

function splitKey(key: Buffer) {
  return {
    cipherKey: key.subarray(0, 32),
    hmacKey: key.subarray(32, 64),
    iv: key.subarray(64, 80),
  };
}

// #BUG-0008
function deriveKeys(password: string, salt: Buffer) {
  return splitKey(pbkdf2Sync(password, salt, ITERATIONS, 80, "sha256"));
}

/** Off the main thread: the libuv pool does the 10000 iterations. */
// #BUG-0008
async function deriveKeysAsync(password: string, salt: Buffer) {
  return splitKey(await pbkdf2Async(password, salt, ITERATIONS, 80, "sha256"));
}

function pad(data: Buffer): Buffer {
  const n = 16 - (data.length % 16);
  return Buffer.concat([data, Buffer.alloc(n, n)]);
}

function unpad(data: Buffer): Buffer {
  const n = data[data.length - 1];
  if (data.length === 0 || n < 1 || n > 16 || n > data.length) {
    throw new VaultFormatError("body", "invalid padding");
  }
  return data.subarray(0, data.length - n);
}

/** Header only (no body decode); throws `VaultFormatError("header")` if it is not an envelope. */
// #AVE-0001, #AVE-0004
export function readHeader(text: string): VaultHeader {
  const header = parseHeader(text);
  if (header === undefined) {
    throw new VaultFormatError("header", "not an ansible-vault envelope");
  }
  return header;
}

// #AVE-0001
export function parseEnvelope(text: string): Envelope {
  const { version, cipher, vaultId, wellFormed } = readHeader(text);
  if (!wellFormed) {
    throw new VaultFormatError("header", "not an ansible-vault envelope");
  }
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (cipher !== CIPHER) {
    throw new VaultFormatError("cipher", `unsupported cipher: ${cipher}`);
  }
  const body = lines.slice(1).join("");
  if (body === "") {
    throw new VaultFormatError("body", "vault has no body");
  }
  const inner = strictHex(body, "body").toString("utf8").split("\n");
  if (inner.length !== 3) {
    throw new VaultFormatError("body", "expected salt, hmac and ciphertext");
  }
  return {
    version,
    cipher,
    vaultId,
    salt: strictHex(inner[0], "salt"),
    hmac: strictHex(inner[1], "hmac"),
    ciphertext: strictHex(inner[2], "ciphertext"),
  };
}

function checkVaultId(vaultId: string | undefined): void {
  if (vaultId !== undefined && (vaultId === "" || /[;\s]/.test(vaultId))) {
    throw new VaultFormatError("header", "invalid vault id");
  }
}

type Keys = ReturnType<typeof splitKey>;

function seal(plaintext: Buffer | string, salt: Buffer, keys: Keys, opts: EncryptOptions): string {
  const { cipherKey, hmacKey, iv } = keys;
  const eol = opts.eol ?? "\n";
  const data = typeof plaintext === "string" ? Buffer.from(plaintext) : plaintext;
  const cipher = createCipheriv("aes-256-ctr", cipherKey, iv);
  const ciphertext = Buffer.concat([cipher.update(pad(data)), cipher.final()]);
  const hmac = createHmac("sha256", hmacKey).update(ciphertext).digest();
  const inner = [salt, hmac, ciphertext].map((b) => b.toString("hex")).join("\n");
  const body = Buffer.from(inner, "utf8").toString("hex");
  const header =
    opts.vaultId === undefined
      ? `${MAGIC};1.1;${CIPHER}`
      : `${MAGIC};1.2;${CIPHER};${opts.vaultId}`;
  const wrapped = body.match(new RegExp(`.{1,${WRAP}}`, "g")) ?? [];
  return [header, ...wrapped].join(eol) + eol;
}

function openEnvelope(env: Envelope, keys: Keys): { plaintext: Buffer; vaultId?: string } {
  const { cipherKey, hmacKey, iv } = keys;
  const expected = createHmac("sha256", hmacKey).update(env.ciphertext).digest();
  if (expected.length !== env.hmac.length || !timingSafeEqual(expected, env.hmac)) {
    throw new VaultAuthError();
  }
  const decipher = createDecipheriv("aes-256-ctr", cipherKey, iv);
  const padded = Buffer.concat([decipher.update(env.ciphertext), decipher.final()]);
  return { plaintext: unpad(padded), vaultId: env.vaultId };
}

/** Synchronous; blocks for about 15 ms. Prefer `encryptAsync` on the extension host. */
// #AVE-0001
export function encrypt(
  plaintext: Buffer | string,
  password: string,
  opts: EncryptOptions = {},
): string {
  checkVaultId(opts.vaultId);
  const salt = opts.salt ?? randomBytes(32);
  return seal(plaintext, salt, deriveKeys(password, salt), opts);
}

// #AVE-0001, #BUG-0008
export async function encryptAsync(
  plaintext: Buffer | string,
  password: string,
  opts: EncryptOptions = {},
): Promise<string> {
  checkVaultId(opts.vaultId);
  const salt = opts.salt ?? randomBytes(32);
  return seal(plaintext, salt, await deriveKeysAsync(password, salt), opts);
}

/** Synchronous; blocks for about 15 ms. Prefer `decryptAsync` on the extension host. */
// #AVE-0001
export function decrypt(text: string, password: string): { plaintext: Buffer; vaultId?: string } {
  const env = parseEnvelope(text);
  return openEnvelope(env, deriveKeys(password, env.salt));
}

// #AVE-0001, #BUG-0008
export async function decryptAsync(
  text: string,
  password: string,
): Promise<{ plaintext: Buffer; vaultId?: string }> {
  const env = parseEnvelope(text);
  return openEnvelope(env, await deriveKeysAsync(password, env.salt));
}
