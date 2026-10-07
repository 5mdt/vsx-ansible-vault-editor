// #AVE-0003: find a vault secret the way Ansible does, prompting only as a last resort.

import { existsSync, readFileSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import {
  ansibleCfgCandidates,
  DEFAULT_LABEL,
  findAnsibleCfg,
  parseIdentityList,
  parseIni,
  type Identity,
} from "./ansible-cfg";
import { isClientScript, readSource, SourceError } from "./sources";

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

type Cfg = { dir: string; defaults: Record<string, string> } | undefined;

/** How long source reads are reused when nothing invalidates them. */
const SNAPSHOT_TTL_MS = 30_000;

/** One consistent view of the configured sources, shared by every lookup until it expires. */
interface Snapshot {
  at: number;
  sources: Promise<Identity[]>;
  /** One read (or script run) per source and label; failures are cached and reported once. */
  reads: Map<string, Promise<string | undefined>>;
  /** Set once `sources` has resolved, for the synchronous `hasSourceFor`. */
  resolved?: Identity[];
}

// #AVE-0003, #BUG-0009
export class SecretResolver {
  private readonly cache = new Map<string, string>();
  private readonly pending = new Map<string, string>();
  private snap: Snapshot | undefined;

  constructor(private readonly deps: ResolverDeps) {}

  /** Drop cached source reads; call when settings or the environment change. */
  // #BUG-0009
  invalidate(): void {
    this.snap = undefined;
  }

  // #BUG-0009
  private snapshot(): Snapshot {
    if (!this.snap || Date.now() - this.snap.at > SNAPSHOT_TTL_MS) {
      const snap: Snapshot = {
        at: Date.now(),
        sources: this.loadSources().then((r) => (snap.resolved = r)),
        reads: new Map(),
      };
      this.snap = snap;
    }
    return this.snap;
  }

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

  private cfgFrom(path: string, text: string): Cfg {
    return { dir: dirname(path), defaults: parseIni(text).defaults ?? {} };
  }

  // #BUG-0008
  private async cfgSection(): Promise<Cfg> {
    const base = {
      env: this.deps.env,
      workspaceRoot: this.deps.workspaceRoot,
      home: this.deps.home,
    };
    const present = new Set<string>();
    await Promise.all(
      ansibleCfgCandidates(base).map((c) =>
        access(c).then(
          () => void present.add(c),
          () => {},
        ),
      ),
    );
    const path = findAnsibleCfg({ ...base, exists: (p) => present.has(p) });
    if (!path) return undefined;
    try {
      return this.cfgFrom(path, await readFile(path, "utf8"));
    } catch {
      this.deps.report(`${path}: could not read ansible.cfg`);
      return undefined;
    }
  }

  /** Blocking variant for the synchronous `hasSourceFor` when no snapshot has loaded yet. */
  private cfgSectionSync(): Cfg {
    const path = findAnsibleCfg({
      env: this.deps.env,
      workspaceRoot: this.deps.workspaceRoot,
      home: this.deps.home,
      exists: existsSync,
    });
    if (!path) return undefined;
    try {
      return this.cfgFrom(path, readFileSync(path, "utf8"));
    } catch {
      this.deps.report(`${path}: could not read ansible.cfg`);
      return undefined;
    }
  }

  /** Every configured source in doc order: setting, env, ansible.cfg. */
  private build(cfg: Cfg): Identity[] {
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

  private async loadSources(): Promise<Identity[]> {
    return this.build(await this.cfgSection());
  }

  /** One read of a source for a label per snapshot; never throws. */
  // #BUG-0009
  private read(snap: Snapshot, src: Source): Promise<string | undefined> {
    // Only `*-client` scripts see the label, so only they need a read per label.
    const key = isClientScript(src.path) ? `${src.label}\0${src.path}` : src.path;
    let p = snap.reads.get(key);
    if (!p) {
      p = readSource({ ...src, trusted: this.deps.trusted }).catch((e) => {
        this.deps.report(e instanceof SourceError ? e.message : String(e));
        return undefined;
      });
      snap.reads.set(key, p);
    }
    return p;
  }

  /** Secrets to try for a vault ID, best first, without prompting. */
  // #BUG-0009
  async candidates(vaultId: string): Promise<string[]> {
    const snap = this.snapshot();
    const found: string[] = [];
    const add = (s: string | undefined) => {
      if (s && !found.includes(s)) found.push(s);
    };
    const wanted = (await snap.sources)
      .filter((s) => s.label === DEFAULT_LABEL || s.label === vaultId)
      .map((s) => ({ path: s.source, label: vaultId }));
    for (const src of wanted) add(await this.read(snap, src));
    add(this.cache.get(vaultId));
    add(await this.deps.store.get(vaultId));
    return found;
  }

  /** Every vault ID label we could have a secret for, plus `default`. */
  async labels(): Promise<string[]> {
    const labels = new Set<string>([DEFAULT_LABEL]);
    for (const s of await this.snapshot().sources) labels.add(s.label);
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
    const snap = this.snapshot();
    const list = snap.resolved ?? (snap.resolved = this.build(this.cfgSectionSync()));
    return list.some((s) => s.label === vaultId);
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
    this.invalidate();
  }
}
