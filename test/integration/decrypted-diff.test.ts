import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CONFIG_KEYS,
  textconvCommand,
  withManagedAttributes,
  withoutManagedAttributes,
} from "../../src/diff/git-config";
import { encrypt } from "../../src/vault/format";

const root = join(__dirname, "..", "..");
const hasGit = spawnSync("git", ["--version"]).status === 0;
let dir: string;
let repo: string;
let pwFile: string;

const git = (...args: string[]) =>
  execFileSync("git", args, {
    cwd: repo,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_PAGER: "cat" },
  }).toString();

beforeAll(() => {
  execFileSync("npm", ["run", "bundle"], { cwd: root, stdio: "pipe" });
  dir = mkdtempSync(join(tmpdir(), "ave-gitdiff-"));
  repo = join(dir, "repo");
  pwFile = join(dir, "pw");
  writeFileSync(pwFile, "secret", { mode: 0o600 });
  execFileSync("git", ["init", "-q", repo]);
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  writeFileSync(join(repo, "secrets.yml"), encrypt("db_password: old\nuser: admin\n", "secret"));
  git("add", "secrets.yml");
  git("commit", "-q", "-m", "first");
  writeFileSync(join(repo, "secrets.yml"), encrypt("db_password: new\nuser: admin\n", "secret"));
}, 120_000);
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// #AVE-0015
describe.skipIf(!hasGit)("git diff driver", () => {
  const enable = (passwordFile?: string) => {
    git(
      "config",
      "--local",
      CONFIG_KEYS.textconv,
      textconvCommand(join(root, "build", "textconv.js"), passwordFile),
    );
    git("config", "--local", CONFIG_KEYS.cache, "false");
    const attrs = join(repo, ".git", "info", "attributes");
    writeFileSync(
      attrs,
      withManagedAttributes(existsSync(attrs) ? readFileSync(attrs, "utf8") : "", ["*.yml"]),
    );
  };

  it("shows ciphertext before it is enabled", () => {
    expect(git("diff")).toContain("$ANSIBLE_VAULT");
  });

  it("shows the plaintext change once enabled, and no ciphertext", () => {
    enable(pwFile);
    const out = git("diff");
    expect(out).toContain("-db_password: old");
    expect(out).toContain("+db_password: new");
    expect(out).not.toContain("$ANSIBLE_VAULT");
    expect(git("status", "--porcelain").trim()).toBe("M secrets.yml");
  });

  it("still produces a diff with no usable secret", () => {
    git(
      "config",
      "--local",
      CONFIG_KEYS.textconv,
      textconvCommand(join(root, "build", "textconv.js"), join(dir, "missing")),
    );
    expect(git("diff")).toContain("$ANSIBLE_VAULT");
  });

  it("goes back to ciphertext when disabled", () => {
    git("config", "--local", "--unset", CONFIG_KEYS.textconv);
    const attrs = join(repo, ".git", "info", "attributes");
    writeFileSync(attrs, withoutManagedAttributes(readFileSync(attrs, "utf8")));
    expect(git("diff")).toContain("$ANSIBLE_VAULT");
  });
});
