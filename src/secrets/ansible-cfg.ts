// #AVE-0003: locate and read ansible.cfg, parse vault_identity_list.

import { join } from "node:path";

export interface FindCfgOptions {
  env: Record<string, string | undefined>;
  workspaceRoot?: string;
  home: string;
  exists: (path: string) => boolean;
}

// #AVE-0003
export function findAnsibleCfg(o: FindCfgOptions): string | undefined {
  const candidates = [
    o.env.ANSIBLE_CONFIG,
    o.workspaceRoot && join(o.workspaceRoot, "ansible.cfg"),
    join(o.home, ".ansible.cfg"),
    "/etc/ansible/ansible.cfg",
  ];
  for (const c of candidates) {
    if (c && o.exists(c)) return c;
  }
  return undefined;
}

export type Ini = Record<string, Record<string, string>>;

// #AVE-0003
export function parseIni(text: string): Ini {
  const out: Ini = {};
  let section = "";
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) continue;
    const head = /^\[([^\]]+)\]$/.exec(line);
    if (head) {
      section = head[1].trim();
      out[section] ??= {};
      continue;
    }
    const eq = line.search(/[=:]/);
    if (eq < 0 || section === "") continue;
    out[section][line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return out;
}

export interface Identity {
  label: string;
  source: string;
}

export const DEFAULT_LABEL = "default";

// #AVE-0003
export function parseIdentityList(list: string | undefined): Identity[] {
  if (!list) return [];
  return list
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e !== "")
    .map((e) => {
      const at = e.indexOf("@");
      return at < 0
        ? { label: DEFAULT_LABEL, source: e }
        : { label: e.slice(0, at), source: e.slice(at + 1) };
    });
}
