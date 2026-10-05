import { describe, expect, it } from "vitest";
import {
  blockAt,
  describeDocument,
  fileVaultId,
  findVaultBlocks,
} from "../../src/detect";

const doc = [
  "db:",
  "  password: !vault |",
  "    $ANSIBLE_VAULT;1.1;AES256",
  "    6162",
  "  user: bob",
  "items:",
  "  - !vault |",
  "    $ANSIBLE_VAULT;1.2;AES256;prod",
  "    6364",
  "  - other",
  "",
].join("\n");

// #AVE-0012
describe("file header detection", () => {
  it("1.1 header has no id", () => {
    expect(fileVaultId("$ANSIBLE_VAULT;1.1;AES256\nabcd\n")).toEqual({
      vaultId: undefined,
    });
  });

  it("1.2 header carries the id, CRLF tolerated", () => {
    expect(fileVaultId("$ANSIBLE_VAULT;1.2;AES256;prod\r\nabcd\r\n")).toEqual({
      vaultId: "prod",
    });
  });

  it("header must be the first line", () => {
    expect(fileVaultId("# note\n$ANSIBLE_VAULT;1.1;AES256\n")).toBeUndefined();
  });

  it("plain and empty text are not vaulted", () => {
    expect(fileVaultId("a: 1\n")).toBeUndefined();
    expect(fileVaultId("")).toBeUndefined();
  });
});

// #AVE-0012
describe("inline block detection", () => {
  it("finds map and list-item blocks with ids and ciphertext", () => {
    const blocks = findVaultBlocks(doc);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].vaultId).toBeUndefined();
    expect(blocks[0].ciphertext).toBe("$ANSIBLE_VAULT;1.1;AES256\n6162\n");
    expect(blocks[1].vaultId).toBe("prod");
    expect(doc.slice(blocks[0].start, blocks[0].end)).toBe(
      "!vault |\n    $ANSIBLE_VAULT;1.1;AES256\n    6162",
    );
  });

  it("works with CRLF", () => {
    const blocks = findVaultBlocks(doc.replace(/\n/g, "\r\n"));
    expect(blocks).toHaveLength(2);
    expect(blocks[1].vaultId).toBe("prod");
  });

  it("ignores a header inside a comment or a plain string", () => {
    const text = [
      "# $ANSIBLE_VAULT;1.1;AES256",
      "note: '$ANSIBLE_VAULT;1.1;AES256'",
      "k: v",
      "",
    ].join("\n");
    expect(findVaultBlocks(text)).toEqual([]);
  });

  it("blockAt follows offsets, ends inclusive", () => {
    const blocks = findVaultBlocks(doc);
    expect(blockAt(blocks, blocks[0].start)).toBe(blocks[0]);
    expect(blockAt(blocks, blocks[0].end)).toBe(blocks[0]);
    expect(blockAt(blocks, doc.indexOf("bob"))).toBeUndefined();
    expect(blockAt(blocks, blocks[1].start + 3)).toBe(blocks[1]);
  });
});

// #AVE-0012
describe("document state follows the cursor", () => {
  it("plain value: not in a block, status counts inline blocks", () => {
    const s = describeDocument(doc, doc.indexOf("bob"));
    expect(s.fileIsVaulted).toBe(false);
    expect(s.inVaultBlock).toBe(false);
    expect(s.hasMarker).toBe(false);
    expect(s.status).toBe("🔒 2 inline");
  });

  it("inside a block flips inVaultBlock", () => {
    const s = describeDocument(doc, doc.indexOf("6162"));
    expect(s.inVaultBlock).toBe(true);
  });

  it("vaulted file shows its id or 'vault'", () => {
    expect(describeDocument("$ANSIBLE_VAULT;1.2;AES256;prod\nab\n", 0).status).toBe(
      "🔒 prod",
    );
    expect(describeDocument("$ANSIBLE_VAULT;1.1;AES256\nab\n", 0).status).toBe(
      "🔒 vault",
    );
    expect(describeDocument("$ANSIBLE_VAULT;1.1;AES256\nab\n", 0).fileIsVaulted).toBe(
      true,
    );
  });

  it("nothing vaulted -> no status", () => {
    expect(describeDocument("a: 1\n", 0).status).toBeUndefined();
  });
});
