import { describe, expect, it } from "vitest";
import { NativeBackend } from "../../src/vault/backend";
import { encrypt } from "../../src/vault/format";
import {
  NoSecretMatchedError,
  chooseEncryptId,
  decryptWithSecrets,
  knownVaultIds,
  secretForEncrypt,
} from "../../src/secrets/vault-ids";
import type { PromptFn } from "../../src/secrets/resolver";
import { SecretResolver, type SecretStore } from "../../src/secrets/resolver";

class MemStore implements SecretStore {
  data = new Map<string, string>();
  async get(id: string) {
    return this.data.get(id);
  }
  async set(id: string, s: string) {
    this.data.set(id, s);
  }
  async delete(id: string) {
    this.data.delete(id);
  }
  async ids() {
    return [...this.data.keys()];
  }
}

function make(
  keychain: Record<string, string>,
  prompt: PromptFn = async () => undefined,
) {
  const store = new MemStore();
  for (const [k, v] of Object.entries(keychain)) store.data.set(k, v);
  return {
    store,
    resolver: new SecretResolver({
      env: {},
      home: "/nonexistent-home",
      trusted: true,
      store,
      report: () => {},
      prompt,
    }),
  };
}

// #AVE-0004
describe("encrypt id selection", () => {
  const never = async () => {
    throw new Error("picker should not open");
  };

  it("one id known -> used silently", async () => {
    expect(await chooseEncryptId(["prod"], undefined, never)).toEqual({
      cancelled: false,
      vaultId: "prod",
    });
  });

  it("several ids -> picker, default pre-selected, choice returned", async () => {
    let seen: [string[], string | undefined] | undefined;
    const out = await chooseEncryptId(["prod", "dev"], "dev", async (ids, d) => {
      seen = [ids, d];
      return "prod";
    });
    expect(seen).toEqual([["prod", "dev"], "dev"]);
    expect(out).toEqual({ cancelled: false, vaultId: "prod" });
  });

  it("picker can choose 'no ID'", async () => {
    const out = await chooseEncryptId(["a", "b"], undefined, async () => null);
    expect(out).toEqual({ cancelled: false, vaultId: undefined });
  });

  it("picker escape cancels", async () => {
    const out = await chooseEncryptId(["a", "b"], undefined, async () => undefined);
    expect(out).toEqual({ cancelled: true });
  });

  it("none known -> defaultVaultId", async () => {
    expect(await chooseEncryptId([], "team", never)).toEqual({
      cancelled: false,
      vaultId: "team",
    });
  });

  it("none known, no default -> no id (1.1 header)", async () => {
    expect(await chooseEncryptId([], undefined, never)).toEqual({
      cancelled: false,
      vaultId: undefined,
    });
  });
});

// #AVE-0004
describe("known vault ids", () => {
  it("merges labels and default setting, excludes the `default` label", async () => {
    const { resolver } = make({ prod: "x" });
    expect((await knownVaultIds(resolver, "dev")).sort()).toEqual(["dev", "prod"]);
    expect(await knownVaultIds(resolver, "prod")).toEqual(["prod"]);
    expect(await knownVaultIds(resolver, undefined)).toEqual(["prod"]);
  });
});

// #AVE-0004
describe("decrypt with secrets", () => {
  const backend = new NativeBackend();

  it("1.2 header uses that id's secret", async () => {
    const text = encrypt("hi", "prod-pw", { vaultId: "prod" });
    const { resolver } = make({ prod: "prod-pw", dev: "dev-pw" });
    const out = await decryptWithSecrets(text, backend, resolver);
    expect(out.plaintext.toString()).toBe("hi");
    expect(out.vaultId).toBe("prod");
  });

  it("falls back to every known secret when the id's secret fails", async () => {
    const text = encrypt("hi", "dev-pw", { vaultId: "prod" });
    const { resolver } = make({ prod: "wrong", dev: "dev-pw" });
    const out = await decryptWithSecrets(text, backend, resolver);
    expect(out.plaintext.toString()).toBe("hi");
  });

  it("1.1 header tries every known secret, first match wins", async () => {
    const text = encrypt("hi", "dev-pw");
    const { resolver } = make({ prod: "nope", dev: "dev-pw" });
    expect((await decryptWithSecrets(text, backend, resolver)).plaintext.toString()).toBe(
      "hi",
    );
  });

  it("prompts when nothing matches and remembers only after success", async () => {
    const text = encrypt("hi", "typed-pw");
    const asked: boolean[] = [];
    const { resolver, store } = make({}, async (_id, mismatch) => {
      asked.push(mismatch);
      return { secret: mismatch ? "typed-pw" : "typo", remember: true };
    });
    const out = await decryptWithSecrets(text, backend, resolver);
    expect(out.plaintext.toString()).toBe("hi");
    expect(asked).toEqual([false, true]);
    expect([...store.data.values()]).toEqual(["typed-pw"]);
  });

  it("cancelled prompt -> 'no secret matched'", async () => {
    const text = encrypt("hi", "pw");
    const { resolver } = make({ other: "wrong" });
    const err = await decryptWithSecrets(text, backend, resolver).catch((e) => e);
    expect(err).toBeInstanceOf(NoSecretMatchedError);
    expect(err.message).toMatch(/no secret matched/);
  });

  it("non-auth errors propagate instead of trying the next secret", async () => {
    const boom = new Error("disk on fire");
    const failing = {
      ...backend,
      decrypt: async () => {
        throw boom;
      },
    } as unknown as NativeBackend;
    const { resolver } = make({ prod: "a", dev: "b" });
    await expect(
      decryptWithSecrets(encrypt("x", "a", { vaultId: "prod" }), failing, resolver),
    ).rejects.toBe(boom);
  });
});

// #AVE-0004
describe("secret for encrypt", () => {
  it("uses a configured candidate without prompting", async () => {
    const { resolver } = make({ prod: "stored" }, async () => {
      throw new Error("must not prompt");
    });
    expect(await secretForEncrypt(resolver, "prod")).toBe("stored");
  });

  it("prompts, and remembers right away when asked", async () => {
    const { resolver, store } = make({}, async () => ({ secret: "typed", remember: true }));
    expect(await secretForEncrypt(resolver, "prod")).toBe("typed");
    expect(store.data.get("prod")).toBe("typed");
  });

  it("does not store when remember is off", async () => {
    const { resolver, store } = make({}, async () => ({ secret: "typed", remember: false }));
    expect(await secretForEncrypt(resolver, "prod")).toBe("typed");
    expect(store.data.size).toBe(0);
  });

  it("cancelled prompt -> undefined", async () => {
    const { resolver } = make({});
    expect(await secretForEncrypt(resolver, "prod")).toBeUndefined();
  });
});
