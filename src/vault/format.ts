// AVE-0001: ansible-vault envelope format (1.1 / 1.2, AES256). Stub: tests first.

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

export function parseEnvelope(_text: string): Envelope {
  throw new Error("not implemented");
}

export function encrypt(
  _plaintext: Buffer | string,
  _password: string,
  _opts?: EncryptOptions,
): string {
  throw new Error("not implemented");
}

export function decrypt(
  _text: string,
  _password: string,
): { plaintext: Buffer; vaultId?: string } {
  throw new Error("not implemented");
}
