import { describe, expect, it } from "vitest";
import { textconvCommand, withManagedAttributes, withoutManagedAttributes } from "../../src/diff/git-config";

// #AVE-0015
describe("git diff driver config", () => {
  it("adds a managed block and keeps foreign lines", () => {
    const out = withManagedAttributes("*.png binary\n", ["*.yml", "*.vault"]);
    expect(out).toBe(
      "*.png binary\n# ansible-vault (managed) begin\n*.yml diff=ansible-vault\n*.vault diff=ansible-vault\n# ansible-vault (managed) end\n",
    );
  });

  it("works on an empty file and replaces rather than duplicates", () => {
    const once = withManagedAttributes("", ["*.yml"]);
    const twice = withManagedAttributes(once, ["*.yaml"]);
    expect(twice.match(/managed\) begin/g)).toHaveLength(1);
    expect(twice).toContain("*.yaml diff=ansible-vault");
    expect(twice).not.toContain("*.yml diff=");
  });

  it("removes only its own block", () => {
    const text = "*.png binary\n" + withManagedAttributes("", ["*.yml"]) + "*.jpg binary\n";
    expect(withoutManagedAttributes(text)).toBe("*.png binary\n*.jpg binary\n");
    expect(withoutManagedAttributes(withManagedAttributes("", ["*.yml"])).trim()).toBe("");
  });

  it("quotes paths in the textconv command", () => {
    expect(textconvCommand("/a b/textconv.js")).toBe('node "/a b/textconv.js"');
    expect(textconvCommand("/s.js", '/p"w')).toBe('node "/s.js" --password-file "/p\\"w"');
  });
});
