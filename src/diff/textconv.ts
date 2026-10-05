// #AVE-0015: the git `textconv` driver: print a file's plaintext, or the file unchanged.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { SecretResolver } from "../secrets/resolver";
import { decryptQuiet } from "../secrets/vault-ids";
import { NativeBackend } from "../vault/backend";
import { plainView } from "./plain";

export interface TextconvIo {
  env: Record<string, string | undefined>;
  cwd: string;
  write(text: string): void;
}

// #AVE-0015
export function parseArgs(argv: string[]): { file?: string; passwordFile?: string } {
  const out: { file?: string; passwordFile?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--password-file") out.passwordFile = argv[++i];
    else out.file = argv[i];
  }
  return out;
}

/** Never throws for a secret problem: git would abort the whole diff over it. */
// #AVE-0015
export async function runTextconv(argv: string[], io: TextconvIo): Promise<void> {
  const { file, passwordFile } = parseArgs(argv);
  if (!file) return;
  const text = readFileSync(file, "utf8");
  if (!text.includes("$ANSIBLE_VAULT;")) {
    io.write(text);
    return;
  }
  try {
    io.write(await convert(text, passwordFile, io));
  } catch {
    io.write(text);
  }
}

async function convert(text: string, passwordFile: string | undefined, io: TextconvIo): Promise<string> {
  const resolver = new SecretResolver({
    passwordFile,
    env: io.env,
    workspaceRoot: io.cwd,
    home: homedir(),
    // No VS Code here to ask: a cloned repository must not run code through `git diff`.
    trusted: false,
    store: {
      get: async () => undefined,
      set: async () => {},
      delete: async () => {},
      ids: async () => [],
    },
    prompt: async () => undefined,
    report: () => {},
  });
  const backend = new NativeBackend();
  return plainView(
    text,
    async (c) => {
      const r = await decryptQuiet(c, backend, resolver);
      if (!r.ok) throw new Error(r.reason);
      return r;
    },
    "keep",
  );
}
