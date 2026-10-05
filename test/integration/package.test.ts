import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(__dirname, "..", "..");

// #BUG-0002
describe("bundled extension", () => {
  let listed: string[];

  beforeAll(() => {
    execFileSync("npm", ["run", "bundle"], { cwd: root, stdio: "pipe" });
    listed = execFileSync("npx", ["vsce", "ls", "--no-dependencies", "--readme-path", "extension/README.md"], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    })
      .toString()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }, 120_000);

  it("produces build/extension.js with the yaml dependency inlined", () => {
    const bundle = join(root, "build", "extension.js");
    expect(existsSync(bundle)).toBe(true);
    expect(statSync(bundle).size).toBeGreaterThan(50_000);
  });

  it("ships the bundle and manifest", () => {
    expect(listed).toContain("build/extension.js");
    expect(listed).toContain("package.json");
  });

  it("ships only the bundle from build/, no stale tsc output", () => {
    expect(listed.filter((f) => f.startsWith("build/"))).toEqual(["build/extension.js"]);
  });

  it("ships no sources, tests or node_modules", () => {
    for (const f of listed) {
      expect(f).not.toMatch(/^(src|test|node_modules|docs|scripts)\//);
      expect(f).not.toMatch(/\.map$/);
    }
  });
});
