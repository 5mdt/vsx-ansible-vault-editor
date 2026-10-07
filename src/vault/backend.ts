// #AVE-0002: crypto backends. `native` wraps format.ts, `cli` shells out to ansible-vault.

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptAsync, encryptAsync, VaultAuthError, VaultFormatError } from "./format";

export interface BackendEncryptOptions {
  vaultId?: string;
  eol?: "\n" | "\r\n";
}

export interface VaultBackend {
  encrypt(
    plain: Buffer | string,
    password: string,
    opts?: BackendEncryptOptions,
  ): Promise<string>;
  decrypt(
    text: string,
    password: string,
  ): Promise<{ plaintext: Buffer; vaultId?: string }>;
  rekey(
    text: string,
    oldPassword: string,
    newPassword: string,
    opts?: BackendEncryptOptions,
  ): Promise<string>;
}

// #AVE-0002, #BUG-0008
export class NativeBackend implements VaultBackend {
  async encrypt(
    plain: Buffer | string,
    password: string,
    opts: BackendEncryptOptions = {},
  ): Promise<string> {
    return encryptAsync(plain, password, opts);
  }

  async decrypt(text: string, password: string) {
    return decryptAsync(text, password);
  }

  // #BUG-0015: only tests call rekey; the commands decrypt and seal themselves.
  async rekey(
    text: string,
    oldPassword: string,
    newPassword: string,
    opts: BackendEncryptOptions = {},
  ): Promise<string> {
    const { plaintext, vaultId } = await decryptAsync(text, oldPassword);
    return encryptAsync(plaintext, newPassword, { vaultId, ...opts });
  }
}

export interface RunResult {
  code: number;
  stdout: Buffer;
  stderr: string;
}

export type Runner = (
  cmd: string,
  args: string[],
  stdin: Buffer,
) => Promise<RunResult>;

/** The configured ansible-vault executable does not exist. */
// #AVE-0002
export class CliNotFoundError extends Error {
  constructor(public readonly cliPath: string) {
    super(`ansible-vault executable not found: ${cliPath}`);
    this.name = "CliNotFoundError";
  }
}

/** ansible-vault exited non-zero. Carries stderr, never the secret. */
// #AVE-0002
export class CliError extends Error {
  constructor(
    public readonly code: number,
    stderr: string,
  ) {
    super(`ansible-vault failed (exit ${code}): ${stderr.trim()}`);
    this.name = "CliError";
  }
}

// #AVE-0002
export const spawnRunner: Runner = (cmd, args, stdin) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => err.push(d));
    child.on("error", reject);
    child.on("close", (code) =>
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(out),
        stderr: Buffer.concat(err).toString("utf8"),
      }),
    );
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });

const DEFAULT_LABEL = "default";

/** Vault ID from the header line, without parsing the body. */
// #BUG-0012: one of four places that parse the vault header; DEFAULT_LABEL is also defined in secrets/ansible-cfg.ts.
function headerLabel(text: string): string {
  const header = text.split(/\r?\n/, 1)[0].trim().split(";");
  if (header[0] !== "$ANSIBLE_VAULT" || (header[1] !== "1.1" && header[1] !== "1.2")) {
    throw new VaultFormatError("header", "not an ansible-vault envelope");
  }
  return header[1] === "1.2" && header[3] ? header[3] : DEFAULT_LABEL;
}

function withEol(text: string, eol: "\n" | "\r\n"): string {
  return text.replace(/\r?\n/g, eol);
}

// #AVE-0002
export class CliBackend implements VaultBackend {
  constructor(
    private readonly cliPath: string,
    private readonly run: Runner = spawnRunner,
  ) {}

  /** Runs ansible-vault with the secret in a 0600 file removed in `finally`. */
  private async withSecret(
    password: string,
    label: string,
    build: (vaultIdArg: string) => string[],
    stdin: Buffer,
  ): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), "ave-"));
    try {
      const file = join(dir, "pw");
      await writeFile(file, password, { mode: 0o600 });
      const args = build(`${label}@${file}`);
      let res: RunResult;
      try {
        res = await this.run(this.cliPath, args, stdin);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") {
          throw new CliNotFoundError(this.cliPath);
        }
        throw e;
      }
      if (res.code !== 0) {
        if (/Decryption failed/.test(res.stderr)) throw new VaultAuthError();
        throw new CliError(res.code, res.stderr);
      }
      return res.stdout;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  async encrypt(
    plain: Buffer | string,
    password: string,
    opts: BackendEncryptOptions = {},
  ): Promise<string> {
    const label = opts.vaultId ?? DEFAULT_LABEL;
    const out = await this.withSecret(
      password,
      label,
      (id) => [
        "encrypt",
        "--vault-id",
        id,
        ...(opts.vaultId ? ["--encrypt-vault-id", opts.vaultId] : []),
        "--output",
        "-",
        "-",
      ],
      typeof plain === "string" ? Buffer.from(plain) : plain,
    );
    return withEol(out.toString("utf8"), opts.eol ?? "\n");
  }

  async decrypt(text: string, password: string) {
    const label = headerLabel(text);
    const out = await this.withSecret(
      password,
      label,
      (id) => ["decrypt", "--vault-id", id, "--output", "-", "-"],
      Buffer.from(text),
    );
    return {
      plaintext: out,
      vaultId: label === DEFAULT_LABEL ? undefined : label,
    };
  }

  async rekey(
    text: string,
    oldPassword: string,
    newPassword: string,
    opts: BackendEncryptOptions = {},
  ): Promise<string> {
    const { plaintext, vaultId } = await this.decrypt(text, oldPassword);
    return this.encrypt(plaintext, newPassword, { vaultId, ...opts });
  }
}
