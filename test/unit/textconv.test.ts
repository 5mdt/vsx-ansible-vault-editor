import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs, runTextconv } from "../../src/diff/textconv";
import { encrypt } from "../../src/vault/format";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ave-textconv-"));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

function run(argv: string[], env: Record<string, string | undefined> = {}): Promise<string> {
  let out = "";
  return runTextconv(argv, { env, cwd: dir, write: (t) => (out += t) }).then(() => out);
}
const file = (name: string, text: string, mode = 0o600) => {
  const p = join(dir, name);
  writeFileSync(p, text, { mode });
  chmodSync(p, mode);
  return p;
};

// #AVE-0015
describe("textconv driver", () => {
  it("parses its arguments", () => {
    expect(parseArgs(["--password-file", "/p", "/f"])).toEqual({ passwordFile: "/p", file: "/f" });
  });

  it("prints plaintext with a password file", async () => {
    const pw = file("pw", "secret");
    const f = file("v.yml", encrypt("a: 1\n", "secret"));
    expect(await run(["--password-file", pw, f])).toBe("a: 1\n");
  });

  it("reads the password file named by the environment", async () => {
    const pw = file("pw", "secret");
    const f = file("v.yml", encrypt("a: 1\n", "secret"));
    expect(await run([f], { ANSIBLE_VAULT_PASSWORD_FILE: pw })).toBe("a: 1\n");
  });

  it("replaces blocks in a mixed file", async () => {
    const pw = file("pw", "secret");
    const lines = encrypt("hello", "secret").trimEnd().split("\n").map((l) => "  " + l).join("\n");
    const f = file("m.yml", `a: 1\nk: !vault |\n${lines}\n`);
    expect(await run(["--password-file", pw, f])).toBe("a: 1\nk: hello\n");
  });

  it("passes a plain file through", async () => {
    expect(await run([file("p.yml", "a: 1\n")])).toBe("a: 1\n");
  });

  it("prints the input unchanged without a secret or with a wrong one", async () => {
    const text = encrypt("a: 1\n", "secret");
    const f = file("v.yml", text);
    expect(await run([f])).toBe(text);
    expect(await run(["--password-file", file("bad", "nope"), f])).toBe(text);
  });

  it("does not run a password script", async () => {
    const marker = join(dir, "ran");
    const script = file("pw.sh", `#!/bin/sh\ntouch ${marker}\necho secret\n`, 0o700);
    const text = encrypt("a: 1\n", "secret");
    const f = file("v.yml", text);
    expect(await run(["--password-file", script, f])).toBe(text);
    expect(() => chmodSync(marker, 0o600)).toThrow();
  });
});
