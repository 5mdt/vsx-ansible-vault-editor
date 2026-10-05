import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CliBackend,
  CliError,
  CliNotFoundError,
  NativeBackend,
  type RunResult,
  type Runner,
} from "../../src/vault/backend";
import { VaultAuthError } from "../../src/vault/format";

const PASSWORD = "s3cret-pw-value";

/** Pulls the password-file path out of `--vault-id label@path`. */
function secretPath(args: string[]): string {
  const spec = args[args.indexOf("--vault-id") + 1];
  return spec.slice(spec.indexOf("@") + 1);
}

interface Seen {
  args: string[];
  mode: number;
  contents: string;
  path: string;
}

function recorder(result: RunResult | Error): { run: Runner; seen: Seen[] } {
  const seen: Seen[] = [];
  const run: Runner = async (_cmd, args) => {
    const path = secretPath(args);
    seen.push({
      args,
      mode: statSync(path).mode & 0o777,
      contents: readFileSync(path, "utf8"),
      path,
    });
    if (result instanceof Error) throw result;
    return result;
  };
  return { run, seen };
}

// #AVE-0002
describe("native backend", () => {
  const b = new NativeBackend();

  it("round-trips with a vault id", async () => {
    const text = await b.encrypt("hi\n", PASSWORD, { vaultId: "prod" });
    const out = await b.decrypt(text, PASSWORD);
    expect(out.plaintext.toString()).toBe("hi\n");
    expect(out.vaultId).toBe("prod");
  });

  it("rekey opens only with the new password", async () => {
    const text = await b.encrypt("data", PASSWORD);
    const re = await b.rekey(text, PASSWORD, "new-pw");
    expect((await b.decrypt(re, "new-pw")).plaintext.toString()).toBe("data");
    await expect(b.decrypt(re, PASSWORD)).rejects.toThrow(VaultAuthError);
  });
});

// #AVE-0002
describe("cli backend secret handling", () => {
  const ok = (stdout: string): RunResult => ({
    code: 0,
    stdout: Buffer.from(stdout),
    stderr: "",
  });

  it("password file is 0600 during the call and removed after success", async () => {
    const { run, seen } = recorder(ok("$ANSIBLE_VAULT;1.1;AES256\n"));
    await new CliBackend("ansible-vault", run).encrypt("x", PASSWORD);
    expect(seen).toHaveLength(1);
    expect(seen[0].mode).toBe(0o600);
    expect(seen[0].contents).toBe(PASSWORD);
    expect(existsSync(seen[0].path)).toBe(false);
  });

  it("password file is removed when the runner throws", async () => {
    const { run, seen } = recorder(new Error("boom"));
    await expect(
      new CliBackend("ansible-vault", run).decrypt(
        "$ANSIBLE_VAULT;1.1;AES256\n00\n",
        PASSWORD,
      ),
    ).rejects.toThrow("boom");
    expect(existsSync(seen[0].path)).toBe(false);
  });

  it("password file is removed on non-zero exit, error omits the secret", async () => {
    const { run, seen } = recorder({ code: 1, stdout: Buffer.alloc(0), stderr: "bad" });
    const err = await new CliBackend("ansible-vault", run)
      .encrypt("x", PASSWORD)
      .catch((e) => e);
    expect(err).toBeInstanceOf(CliError);
    expect(String(err.message)).not.toContain(PASSWORD);
    expect(existsSync(seen[0].path)).toBe(false);
  });

  it("argv never contains the secret", async () => {
    const { run, seen } = recorder(ok("$ANSIBLE_VAULT;1.1;AES256\n"));
    await new CliBackend("ansible-vault", run).encrypt("x", PASSWORD, {
      vaultId: "prod",
    });
    for (const a of seen[0].args) expect(a).not.toContain(PASSWORD);
  });

  it("plaintext goes over stdin, never argv", async () => {
    let stdin = "";
    let argv: string[] = [];
    const run: Runner = async (_c, args, input) => {
      argv = args;
      stdin = input.toString();
      return ok("$ANSIBLE_VAULT;1.1;AES256\n");
    };
    await new CliBackend("ansible-vault", run).encrypt("plain-data", PASSWORD);
    expect(stdin).toBe("plain-data");
    expect(argv.join(" ")).not.toContain("plain-data");
  });

  it("ENOENT becomes CliNotFoundError", async () => {
    const enoent = Object.assign(new Error("spawn"), { code: "ENOENT" });
    const run: Runner = async () => {
      throw enoent;
    };
    await expect(
      new CliBackend("nope", run).encrypt("x", PASSWORD),
    ).rejects.toThrow(CliNotFoundError);
  });

  it("converts CLI output to the requested EOL", async () => {
    const { run } = recorder(ok("$ANSIBLE_VAULT;1.1;AES256\nabcd\n"));
    const text = await new CliBackend("ansible-vault", run).encrypt("x", PASSWORD, {
      eol: "\r\n",
    });
    expect(text).toBe("$ANSIBLE_VAULT;1.1;AES256\r\nabcd\r\n");
  });
});
