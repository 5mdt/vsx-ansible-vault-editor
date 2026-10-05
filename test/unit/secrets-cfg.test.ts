import { describe, expect, it } from "vitest";
import {
  findAnsibleCfg,
  parseIdentityList,
  parseIni,
} from "../../src/secrets/ansible-cfg";

const base = { workspaceRoot: "/ws", home: "/home/u" };
const existing = (...paths: string[]) => (p: string) => paths.includes(p);

// #AVE-0003
describe("ansible.cfg discovery", () => {
  it("ANSIBLE_CONFIG wins over everything", () => {
    const found = findAnsibleCfg({
      ...base,
      env: { ANSIBLE_CONFIG: "/x/a.cfg" },
      exists: existing("/x/a.cfg", "/ws/ansible.cfg", "/home/u/.ansible.cfg"),
    });
    expect(found).toBe("/x/a.cfg");
  });

  it("then the workspace root", () => {
    const found = findAnsibleCfg({
      ...base,
      env: {},
      exists: existing("/ws/ansible.cfg", "/home/u/.ansible.cfg"),
    });
    expect(found).toBe("/ws/ansible.cfg");
  });

  it("then the home directory", () => {
    const found = findAnsibleCfg({
      ...base,
      env: {},
      exists: existing("/home/u/.ansible.cfg", "/etc/ansible/ansible.cfg"),
    });
    expect(found).toBe("/home/u/.ansible.cfg");
  });

  it("then /etc/ansible", () => {
    const found = findAnsibleCfg({
      ...base,
      env: {},
      exists: existing("/etc/ansible/ansible.cfg"),
    });
    expect(found).toBe("/etc/ansible/ansible.cfg");
  });

  it("returns undefined when nothing exists", () => {
    expect(findAnsibleCfg({ ...base, env: {}, exists: () => false })).toBe(
      undefined,
    );
  });

  it("works without a workspace", () => {
    const found = findAnsibleCfg({
      home: "/home/u",
      env: {},
      exists: existing("/home/u/.ansible.cfg"),
    });
    expect(found).toBe("/home/u/.ansible.cfg");
  });
});

// #AVE-0003
describe("ini parsing", () => {
  it("reads sections, keys and skips comments", () => {
    const ini = parseIni(
      [
        "# top comment",
        "[defaults]",
        "vault_password_file = ./pw.txt",
        "; another",
        "inventory=hosts",
        "",
        "[other]",
        "vault_password_file = nope",
      ].join("\n"),
    );
    expect(ini.defaults.vault_password_file).toBe("./pw.txt");
    expect(ini.defaults.inventory).toBe("hosts");
    expect(ini.other.vault_password_file).toBe("nope");
  });

  it("tolerates CRLF", () => {
    expect(parseIni("[defaults]\r\nk = v\r\n").defaults.k).toBe("v");
  });
});

// #AVE-0003
describe("vault_identity_list parsing", () => {
  it("splits on commas, trims, and parses label@source", () => {
    expect(parseIdentityList("dev@~/dev.pw, prod@/etc/prod.pw")).toEqual([
      { label: "dev", source: "~/dev.pw" },
      { label: "prod", source: "/etc/prod.pw" },
    ]);
  });

  it("an entry without @ is the default label", () => {
    expect(parseIdentityList("./pw.txt")).toEqual([
      { label: "default", source: "./pw.txt" },
    ]);
  });

  it("keeps the source `prompt`", () => {
    expect(parseIdentityList("prod@prompt")).toEqual([
      { label: "prod", source: "prompt" },
    ]);
  });

  it("is empty for an empty list", () => {
    expect(parseIdentityList("")).toEqual([]);
    expect(parseIdentityList(undefined)).toEqual([]);
  });
});
