import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SecretResolver,
  type PromptResult,
  type SecretStore,
} from "../../src/secrets/resolver";

class MemStore implements SecretStore {
  data = new Map<string, string>();
  async get(id: string) {
    return this.data.get(id);
  }
  async set(id: string, secret: string) {
    this.data.set(id, secret);
  }
  async delete(id: string) {
    this.data.delete(id);
  }
  async ids() {
    return [...this.data.keys()];
  }
}

let root: string;
let home: string;
let store: MemStore;
let reports: string[];
let prompts: [string, boolean][];
let promptAnswer: PromptResult | undefined;

beforeEach(() => {
  const dir = mkdtempSync(join(tmpdir(), "ave-res-"));
  root = join(dir, "ws");
  home = join(dir, "home");
  mkdirSync(root);
  mkdirSync(home);
  store = new MemStore();
  reports = [];
  prompts = [];
  promptAnswer = undefined;
});
afterEach(() => rmSync(join(root, ".."), { recursive: true, force: true }));

function file(name: string, content: string, mode = 0o600): string {
  const p = join(root, name);
  writeFileSync(p, content, { mode });
  chmodSync(p, mode);
  return p;
}

function resolver(
  over: Partial<ConstructorParameters<typeof SecretResolver>[0]> = {},
) {
  return new SecretResolver({
    env: {},
    workspaceRoot: root,
    home,
    trusted: true,
    store,
    report: (m) => reports.push(m),
    prompt: async (id, mismatch) => {
      prompts.push([id, mismatch]);
      return promptAnswer;
    },
    ...over,
  });
}

// #AVE-0003
describe("resolution order", () => {
  beforeEach(() => {
    file("set.pw", "from-setting");
    file("env.pw", "from-env");
    file("cfg.pw", "from-cfg");
    file("ansible.cfg", "[defaults]\nvault_password_file = cfg.pw\n");
  });

  it("setting wins over env, cfg, cache and keychain", async () => {
    await store.set("prod", "from-store");
    const r = resolver({
      passwordFile: "set.pw",
      env: { ANSIBLE_VAULT_PASSWORD_FILE: "env.pw" },
    });
    expect((await r.candidates("prod"))[0]).toBe("from-setting");
  });

  it("env wins over cfg, cache and keychain", async () => {
    await store.set("prod", "from-store");
    const r = resolver({ env: { ANSIBLE_VAULT_PASSWORD_FILE: "env.pw" } });
    expect((await r.candidates("prod"))[0]).toBe("from-env");
  });

  it("env identity list serves its own label", async () => {
    const r = resolver({
      env: { ANSIBLE_VAULT_IDENTITY_LIST: "prod@env.pw" },
    });
    expect((await r.candidates("prod"))[0]).toBe("from-env");
    expect(await r.candidates("dev")).toEqual(["from-cfg"]);
  });

  it("cfg wins over cache and keychain", async () => {
    await store.set("prod", "from-store");
    expect((await resolver().candidates("prod"))[0]).toBe("from-cfg");
  });

  it("keychain is used when nothing is configured", async () => {
    rmSync(join(root, "ansible.cfg"));
    await store.set("prod", "from-store");
    expect(await resolver().candidates("prod")).toEqual(["from-store"]);
  });

  it("nothing configured -> no candidates", async () => {
    rmSync(join(root, "ansible.cfg"));
    expect(await resolver().candidates("prod")).toEqual([]);
  });

  it("relative paths in ansible.cfg resolve against the cfg directory", async () => {
    mkdirSync(join(root, "sub"));
    writeFileSync(join(root, "sub", "pw"), "from-sub");
    writeFileSync(
      join(root, "sub", "ansible.cfg"),
      "[defaults]\nvault_password_file = pw\n",
    );
    rmSync(join(root, "ansible.cfg"));
    const r = resolver({ env: { ANSIBLE_CONFIG: join(root, "sub", "ansible.cfg") } });
    expect(await r.candidates("x")).toEqual(["from-sub"]);
  });

  it("`prompt` identity source is skipped", async () => {
    writeFileSync(
      join(root, "ansible.cfg"),
      "[defaults]\nvault_identity_list = prod@prompt\n",
    );
    expect(await resolver().candidates("prod")).toEqual([]);
  });

  it("duplicate secrets collapse", async () => {
    file("dup.pw", "from-setting");
    const r = resolver({ passwordFile: "dup.pw" });
    expect(await r.candidates("prod")).toEqual(["from-setting", "from-cfg"]);
  });
});

// #AVE-0003
describe("secret sources", () => {
  it("plain file is fully trimmed", async () => {
    file("pw", "  secret \n\n");
    expect(await resolver({ passwordFile: "pw" }).candidates("a")).toEqual([
      "secret",
    ]);
  });

  it("script stdout loses only CR/LF", async () => {
    file("pw.sh", "#!/bin/sh\nprintf ' sp ace \\r\\n'\n", 0o700);
    expect(await resolver({ passwordFile: "pw.sh" }).candidates("a")).toEqual([
      " sp ace ",
    ]);
  });

  it("non-zero script exit is reported and falls through", async () => {
    file("bad.sh", "#!/bin/sh\nexit 3\n", 0o700);
    file("ansible.cfg", "[defaults]\nvault_password_file = ok.pw\n");
    file("ok.pw", "fallback");
    const r = resolver({ passwordFile: "bad.sh" });
    expect(await r.candidates("a")).toEqual(["fallback"]);
    expect(reports.some((m) => m.includes("bad.sh"))).toBe(true);
  });

  it("missing file is reported and falls through", async () => {
    const r = resolver({ passwordFile: "ghost.pw" });
    expect(await r.candidates("a")).toEqual([]);
    expect(reports.some((m) => m.includes("ghost.pw"))).toBe(true);
  });

  it("empty secret is a failed source", async () => {
    file("empty.pw", "\n");
    const r = resolver({ passwordFile: "empty.pw" });
    expect(await r.candidates("a")).toEqual([]);
    expect(reports).toHaveLength(1);
  });

  it("a *-client script receives --vault-id <label>", async () => {
    file("pw-client.sh", '#!/bin/sh\nprintf "%s" "$*"\n', 0o700);
    const r = resolver({ passwordFile: "pw-client.sh" });
    expect(await r.candidates("prod")).toEqual(["--vault-id prod"]);
  });

  it("untrusted workspace: script is not run, plain files still read", async () => {
    file("run.sh", "#!/bin/sh\ntouch ran\nprintf x\n", 0o700);
    file("plain.pw", "plain");
    const r = resolver({ passwordFile: "run.sh", trusted: false });
    expect(await r.candidates("a")).toEqual([]);
    expect(reports.some((m) => /untrusted/i.test(m))).toBe(true);
    expect(
      await resolver({ passwordFile: "plain.pw", trusted: false }).candidates("a"),
    ).toEqual(["plain"]);
    expect(() => readFileSync(join(root, "ran"))).toThrow();
  });

  it("reports never contain the secret", async () => {
    file("bad.sh", "#!/bin/sh\necho topsecret >&2\nexit 1\n", 0o700);
    await resolver({ passwordFile: "bad.sh" }).candidates("a");
    for (const m of reports) expect(m).not.toContain("topsecret");
  });
});

// #AVE-0003
describe("labels", () => {
  it("collects labels from env, cfg and keychain plus default", async () => {
    file("ansible.cfg", "[defaults]\nvault_identity_list = dev@a.pw, b.pw\n");
    await store.set("prod", "x");
    const r = resolver({ env: { ANSIBLE_VAULT_IDENTITY_LIST: "stage@s.pw" } });
    expect((await r.labels()).sort()).toEqual(
      ["default", "dev", "prod", "stage"].sort(),
    );
  });
});

// #AVE-0003
describe("prompt, remember and forget", () => {
  it("prompt result is cached for the session but not stored", async () => {
    promptAnswer = { secret: "typed", remember: false };
    const r = resolver();
    expect(await r.promptFor("prod", false)).toBe("typed");
    await r.confirm("prod", "typed");
    expect(await r.candidates("prod")).toEqual(["typed"]);
    expect(store.data.size).toBe(0);
  });

  it("remember stores only after confirm", async () => {
    promptAnswer = { secret: "typed", remember: true };
    const r = resolver();
    await r.promptFor("prod", false);
    expect(store.data.size).toBe(0);
    await r.confirm("prod", "typed");
    expect(store.data.get("prod")).toBe("typed");
  });

  it("reject drops the cache and the pending remember", async () => {
    promptAnswer = { secret: "typo", remember: true };
    const r = resolver();
    await r.promptFor("prod", false);
    await r.reject("prod", "typo");
    await r.confirm("prod", "typo");
    expect(await r.candidates("prod")).toEqual([]);
    expect(store.data.size).toBe(0);
  });

  it("passes the mismatch flag to the prompt", async () => {
    promptAnswer = { secret: "s", remember: false };
    await resolver().promptFor("prod", true);
    expect(prompts).toEqual([["prod", true]]);
  });

  it("cancelled prompt returns undefined", async () => {
    expect(await resolver().promptFor("prod", false)).toBeUndefined();
  });

  it("forget clears cache, keychain and remember choices", async () => {
    await store.set("prod", "kept");
    await store.set("dev", "kept2");
    promptAnswer = { secret: "typed", remember: false };
    const r = resolver();
    await r.promptFor("x", false);
    await r.forget();
    expect(store.data.size).toBe(0);
    expect(await r.candidates("x")).toEqual([]);
  });
});

// #AVE-0009
describe("rekeyed secrets", () => {
  it("replace updates the session and an existing keychain entry only", async () => {
    await store.set("prod", "old");
    const r = resolver();
    await r.replace("prod", "new");
    expect((await r.candidates("prod"))[0]).toBe("new");
    expect(store.data.get("prod")).toBe("new");
    await r.replace("dev", "fresh");
    expect((await r.candidates("dev"))[0]).toBe("fresh");
    expect(store.data.has("dev")).toBe(false);
  });

  it("knows when a configured source supplies an ID", () => {
    file("pw", "x");
    expect(resolver({ passwordFile: "pw" }).hasSourceFor("default")).toBe(true);
    expect(resolver().hasSourceFor("prod")).toBe(false);
  });
});
