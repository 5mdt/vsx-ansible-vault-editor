// #AVE-0003: read one secret source, a plain file or an executable.

import { accessSync, constants, readFileSync, statSync } from "node:fs";
import { spawnRunner, type Runner } from "../vault/backend";

export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceError";
  }
}

export interface ReadSourceOptions {
  path: string;
  label: string;
  trusted: boolean;
  run?: Runner;
}

function isExecutable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Ansible passes --vault-id to scripts named `*-client[.ext]`. */
function isClientScript(path: string): boolean {
  const base = path.split("/").pop() ?? path;
  const dot = base.lastIndexOf(".");
  return (dot > 0 ? base.slice(0, dot) : base).endsWith("-client");
}

// #AVE-0003
export async function readSource(o: ReadSourceOptions): Promise<string> {
  let secret: string;
  if (isExecutable(o.path)) {
    if (!o.trusted) {
      throw new SourceError(
        `${o.path}: not run, the workspace is untrusted`,
      );
    }
    const args = isClientScript(o.path) ? ["--vault-id", o.label] : [];
    let res;
    try {
      res = await (o.run ?? spawnRunner)(o.path, args, Buffer.alloc(0));
    } catch (e) {
      throw new SourceError(`${o.path}: could not run (${(e as Error).message})`);
    }
    if (res.code !== 0) {
      throw new SourceError(`${o.path}: script exited with ${res.code}`);
    }
    secret = res.stdout.toString("utf8").replace(/[\r\n]+$/, "");
  } else {
    try {
      secret = readFileSync(o.path, "utf8").trim();
    } catch {
      throw new SourceError(`${o.path}: could not read password file`);
    }
  }
  if (secret === "") throw new SourceError(`${o.path}: secret is empty`);
  return secret;
}
