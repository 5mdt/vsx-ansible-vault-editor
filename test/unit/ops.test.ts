import { parse as yamlParse } from "yaml";

const parse = (t: string) => yamlParse(t, { logLevel: "silent" });
import { describe, expect, it } from "vitest";
import { fileDecrypt, fileEncrypt } from "../../src/commands/file-ops";
import { prepareEncrypt, type OpsDeps } from "../../src/commands/session";
import { RefusedError } from "../../src/errors";
import { decryptBlockEdit, encryptValueEdit, type TextEdit } from "../../src/inline/edits";
import { inlineTargets, plainScalars, scalarAt } from "../../src/inline/yaml-values";
import { SecretResolver, type SecretStore } from "../../src/secrets/resolver";
import { NativeBackend } from "../../src/vault/backend";
import { parseEnvelope } from "../../src/vault/format";

class MemStore implements SecretStore {
  data = new Map<string, string>();
  get = async (id: string) => this.data.get(id);
  set = async (id: string, s: string) => void this.data.set(id, s);
  delete = async (id: string) => void this.data.delete(id);
  ids = async () => [...this.data.keys()];
}

function deps(
  keychain: Record<string, string> = { default: "pw" },
  pick: OpsDeps["pick"] = async () => undefined,
  defaultVaultId?: string,
): OpsDeps {
  const store = new MemStore();
  for (const [k, v] of Object.entries(keychain)) store.data.set(k, v);
  return {
    backend: new NativeBackend(),
    pick,
    defaultVaultId,
    resolver: new SecretResolver({
      env: {},
      home: "/nonexistent-home",
      trusted: true,
      store,
      report: () => {},
      prompt: async () => undefined,
    }),
  };
}

function apply(text: string, ...edits: TextEdit[]): string {
  return [...edits]
    .sort((a, b) => b.start - a.start)
    .reduce((t, e) => t.slice(0, e.start) + e.newText + t.slice(e.end), text);
}

const sample = [
  "# keep me",
  "db:",
  "  password: s3cret",
  '  note: "a: b"',
  "  multi: |",
  "    line one",
  "    line two",
  "items:",
  "  - first",
  "  - key: nested",
  "",
].join("\n");

// #AVE-0005
describe("file encrypt and decrypt", () => {
  it("round-trips", async () => {
    const d = deps();
    const session = (await prepareEncrypt(d))!;
    const enc = await fileEncrypt("a: 1\n", session, "\n");
    expect(enc.startsWith("$ANSIBLE_VAULT;1.1;AES256\n")).toBe(true);
    expect(await fileDecrypt(enc, d)).toBe("a: 1\n");
  });

  it("CRLF documents get CRLF ciphertext", async () => {
    const session = (await prepareEncrypt(deps()))!;
    const enc = await fileEncrypt("a: 1\r\n", session, "\r\n");
    expect(enc.replace(/\r\n/g, "")).not.toMatch(/\n/);
  });

  it("refuses an already encrypted file and a plain decrypt", async () => {
    const d = deps();
    const session = (await prepareEncrypt(d))!;
    const enc = await fileEncrypt("a: 1\n", session, "\n");
    await expect(fileEncrypt(enc, session, "\n")).rejects.toThrow(RefusedError);
    await expect(fileDecrypt("a: 1\n", d)).rejects.toThrow(RefusedError);
  });
});

// #AVE-0004
describe("encrypt session", () => {
  it("uses the vault id the picker returns", async () => {
    const d = deps({ prod: "p1", dev: "p2" }, async () => "prod");
    const s = (await prepareEncrypt(d))!;
    const enc = await fileEncrypt("x", s, "\n");
    expect(parseEnvelope(enc).vaultId).toBe("prod");
  });

  it("cancelled picker -> undefined", async () => {
    expect(await prepareEncrypt(deps({ prod: "p1", dev: "p2" }))).toBeUndefined();
  });

  it("cancelled password prompt -> undefined", async () => {
    expect(await prepareEncrypt(deps({}))).toBeUndefined();
  });
});

// #AVE-0006
describe("inline encrypt and decrypt", () => {
  it("encrypts one value, leaving the rest byte-identical", async () => {
    const d = deps();
    const s = (await prepareEncrypt(d))!;
    const t = scalarAt(sample, sample.indexOf("s3cret"))!;
    const edit = await encryptValueEdit(t, s, "\n");
    const out = apply(sample, edit);
    expect(out).toContain("password: !vault |\n    $ANSIBLE_VAULT;1.1;AES256\n");
    expect(out.startsWith("# keep me\ndb:\n  password: !vault |")).toBe(true);
    expect(
      out.endsWith(
        '  note: "a: b"\n  multi: |\n    line one\n    line two\nitems:\n  - first\n  - key: nested\n',
      ),
    ).toBe(true);
  });

  it("encrypt then decrypt every value restores the document", async () => {
    const d = deps();
    const s = (await prepareEncrypt(d))!;
    const encEdits = await Promise.all(
      plainScalars(sample).map((t) => encryptValueEdit(t, s, "\n")),
    );
    const encrypted = apply(sample, ...encEdits);
    const blocks = inlineTargets(encrypted).targets.filter((t) => t.vault);
    expect(blocks.length).toBe(encEdits.length);
    const decEdits = await Promise.all(blocks.map((b) => decryptBlockEdit(b, d)));
    const restored = apply(encrypted, ...decEdits);
    expect(parse(restored)).toEqual(parse(sample));
    expect(restored).toContain("# keep me");
  });

  it("list item values are handled the same way", async () => {
    const d = deps();
    const s = (await prepareEncrypt(d))!;
    const t = scalarAt(sample, sample.indexOf("first"))!;
    const out = apply(sample, await encryptValueEdit(t, s, "\n"));
    expect(out).toContain("  - !vault |\n    $ANSIBLE_VAULT");
    const b = inlineTargets(out).targets.find((x) => x.vault)!;
    const back = apply(out, await decryptBlockEdit(b, d));
    expect(back).toBe(sample);
  });

  it("CRLF file keeps CRLF in the block", async () => {
    const crlf = sample.replace(/\n/g, "\r\n");
    const s = (await prepareEncrypt(deps()))!;
    const t = scalarAt(crlf, crlf.indexOf("s3cret"))!;
    const out = apply(crlf, await encryptValueEdit(t, s, "\r\n"));
    expect(out.replace(/\r\n/g, "")).not.toMatch(/\n/);
    expect(parse(out).db.password).toMatch(/ANSIBLE_VAULT/);
  });

  it("refuses to encrypt a block again", async () => {
    const d = deps();
    const s = (await prepareEncrypt(d))!;
    const t = scalarAt(sample, sample.indexOf("s3cret"))!;
    const out = apply(sample, await encryptValueEdit(t, s, "\n"));
    const b = inlineTargets(out).targets.find((x) => x.vault)!;
    await expect(encryptValueEdit(b, s, "\n")).rejects.toThrow(RefusedError);
  });

  it("multiline values keep their newlines", async () => {
    const d = deps();
    const s = (await prepareEncrypt(d))!;
    const t = scalarAt(sample, sample.indexOf("line one"))!;
    expect(t.value).toBe("line one\nline two\n");
    const out = apply(sample, await encryptValueEdit(t, s, "\n"));
    const b = inlineTargets(out).targets.find((x) => x.vault)!;
    const back = apply(out, await decryptBlockEdit(b, d));
    expect(parse(back).db.multi).toBe("line one\nline two\n");
  });
});
