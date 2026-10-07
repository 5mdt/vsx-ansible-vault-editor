// #AVE-0003: find a vault secret the way Ansible does, prompting only as a last resort.

import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import {
  DEFAULT_LABEL,
  findAnsibleCfg,
  parseIdentityList,
  parseIni,
  type Identity,
} from "./ansible-cfg";
import { readSource, SourceError } from "./sources";

export interface SecretStore {
  get(vaultId: string): Promise<string | undefined>;
  set(vaultId: string, secret: string): Promise<void>;
  delete(vaultId: string): Promise<void>;
  /** Vault IDs with a stored secret. */
  ids(): Promise<string[]>;
}

export interface PromptResult {
  secret: string;
  remember: boolean;
}

export type PromptFn = (
  vaultId: string,
  mismatch: boolean,
) => Promise<PromptResult | undefined>;

export interface ResolverDeps {
  /** `ansibleVault.passwordFile` */
  passwordFile?: string;
  env: Record<string, string | undefined>;
  workspaceRoot?: string;
  home: string;
  trusted: boolean;
  store: SecretStore;
  prompt: PromptFn;
  /** Never receives a secret. */
  report: (message: string) => void;
}

interface Source {
  path: string;
  label: string;
}

// #AVE-0003
export class SecretResolver {
  private readonly cache = new Map<string, string>();
  private readonly pending = new Map<string, string>();

  constructor(private readonly deps: ResolverDeps) {}

  private expand(path: string, base: string | undefined): string {
    if (path === "~" || path.startsWith("~/")) {
      return join(this.deps.home, path.slice(1));
    }
    if (isAbsolute(path) || base === undefined) return path;
    return join(base, path);
  }

  private identities(list: string | undefined, base: string | undefined): Identity[] {
    return parseIdentityList(list)
      .filter((i) => i.source !== "prompt")
      .map((i) => ({ ...i, source: this.expand(i.source, base) }));
  }

  private cfgSection(): { dir: string; defaults: Record<string, string> } | undefined {
    const path = findAnsibleCfg({
      env: this.deps.env,
      workspaceRoot: this.deps.workspaceRoot,
      home: this.deps.home,
      exists: existsSync,
    });
    if (!path) return undefined;
    try {
      const ini = parseIni(readFileSync(path, "utf8"));
      return { dir: dirname(path), defaults: ini.defaults ?? {} };
    } catch {
      this.deps.report(`${path}: could not read ansible.cfg`);
      return undefined;
    }
  }

  /** Every configured source in doc order: setting, env, ansible.cfg. */
  private sources(): Identity[] {
    const { env, workspaceRoot, passwordFile } = this.deps;
    const out: Identity[] = [];
    if (passwordFile) {
      out.push({ label: DEFAULT_LABEL, source: this.expand(passwordFile, workspaceRoot) });
    }
    out.push(...this.identities(env.ANSIBLE_VAULT_IDENTITY_LIST, workspaceRoot));
    if (env.ANSIBLE_VAULT_PASSWORD_FILE) {
      out.push({
        label: DEFAULT_LABEL,
        source: this.expand(env.ANSIBLE_VAULT_PASSWORD_FILE, workspaceRoot),
      });
    }
    const cfg = this.cfgSection();
    if (cfg) {
      out.push(...this.identities(cfg.defaults.vault_identity_list, cfg.dir));
      if (cfg.defaults.vault_password_file) {
        out.push({
          label: DEFAULT_LABEL,
          source: this.expand(cfg.defaults.vault_password_file, cfg.dir),
        });
      }
    }
    return out;
  }

  /** Secrets to try for a vault ID, best first, without prompting. */
  async candidates(vaultId: string): Promise<string[]> {
    // #BUG-0009: sources() re-reads ansible.cfg and every password file, and re-runs password scripts, on every call.
    const found: string[] = [];
    const add = (s: string | undefined) => {
      if (s && !found.includes(s)) found.push(s);
    };
    const wanted: Source[] = this.sources()
      .filter((s) => s.label === DEFAULT_LABEL || s.label === vaultId)
      .map((s) => ({ path: s.source, label: vaultId }));
    for (const src of wanted) {
      try {
        add(await readSource({ ...src, trusted: this.deps.trusted }));
      } catch (e) {
        this.deps.report(e instanceof SourceError ? e.message : String(e));
      }
    }
    add(this.cache.get(vaultId));
    add(await this.deps.store.get(vaultId));
    return found;
  }

  /** Every vault ID label we could have a secret for, plus `default`. */
  async labels(): Promise<string[]> {
    const labels = new Set<string>([DEFAULT_LABEL]);
    for (const s of this.sources()) labels.add(s.label);
    for (const id of await this.deps.store.ids()) labels.add(id);
    for (const id of this.cache.keys()) labels.add(id);
    return [...labels];
  }

  /** Ask the user. The answer is cached for the session; remembering waits for `confirm`. */
  async promptFor(vaultId: string, mismatch: boolean): Promise<string | undefined> {
    const answer = await this.deps.prompt(vaultId, mismatch);
    if (!answer) return undefined;
    this.cache.set(vaultId, answer.secret);
    if (answer.remember) this.pending.set(vaultId, answer.secret);
    else this.pending.delete(vaultId);
    return answer.secret;
  }

  /** The secret worked: store it if the user asked to remember it. */
  async confirm(vaultId: string, secret: string): Promise<void> {
    if (this.pending.get(vaultId) === secret) {
      this.pending.delete(vaultId);
      await this.deps.store.set(vaultId, secret);
    }
  }

  /** The secret did not work: forget it for this session. */
  async reject(vaultId: string, secret: string): Promise<void> {
    if (this.cache.get(vaultId) === secret) this.cache.delete(vaultId);
    if (this.pending.get(vaultId) === secret) this.pending.delete(vaultId);
  }

  /** A configured password file, env var or ansible.cfg entry supplies this ID. */
  // #AVE-0009
  hasSourceFor(vaultId: string): boolean {
    return this.sources().some((s) => s.label === vaultId);
  }

  /** The ID was rekeyed: use the new secret from now on, in the keychain too if it was there and asked to. */
  // #AVE-0009
  async replace(vaultId: string, secret: string, updateKeychain = true): Promise<void> {
    this.cache.set(vaultId, secret);
    this.pending.delete(vaultId);
    if (updateKeychain && (await this.deps.store.get(vaultId)) !== undefined) {
      await this.deps.store.set(vaultId, secret);
    }
  }

  async forget(): Promise<void> {
    for (const id of await this.deps.store.ids()) {
      await this.deps.store.delete(id);
    }
    this.cache.clear();
    this.pending.clear();
  }
}
