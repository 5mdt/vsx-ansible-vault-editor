// #AVE-0018: shared corpora for the benchmarks; built once at module load, never timed.

import { existsSync } from "node:fs";
import { describe, test } from "vitest";
import { NativeBackend } from "../../src/vault/backend";
import { encrypt } from "../../src/vault/format";

export const PASSWORD = "bench-password";
const SALT = Buffer.alloc(32, 7);

/** #AVE-0018 */
export function payload(bytes: number): Buffer {
  return Buffer.alloc(bytes, "x");
}

/** A vaulted file with a fixed salt. #AVE-0018 */
export function vaultFile(bytes: number, vaultId?: string): string {
  return encrypt(payload(bytes), PASSWORD, { vaultId, salt: SALT });
}

/** `keys` plain `key: value` lines with `blocks` `!vault` values spread through them. #AVE-0018 */
export function yamlWithBlocks(
  keys: number,
  blocks: number,
  opts: { vaultId?: string; markers?: boolean } = {},
): string {
  const cipher = encrypt("s3cret-value", PASSWORD, { vaultId: opts.vaultId, salt: SALT })
    .trimEnd()
    .split("\n")
    .map((l) => "  " + l)
    .join("\n");
  const every = blocks > 0 ? Math.max(1, Math.floor(keys / blocks)) : Infinity;
  const lines: string[] = [];
  let placed = 0;
  for (let i = 0; i < keys; i++) {
    if (placed < blocks && i % every === 0) {
      placed++;
      lines.push(`secret_${i}: !vault |\n${cipher}`);
    } else if (opts.markers && i % 50 === 0) {
      lines.push(`# ansible-vault: encrypt\nkey_${i}: value-${i}`);
    } else {
      lines.push(`key_${i}: value-${i}`);
    }
  }
  return lines.join("\n") + "\n";
}

let freshCount = 0;

/**
 * YAML text that differs from every earlier call but parses the same: a unique trailing comment.
 * `inlineTargets` memoizes the last text, so a bench that repeats one string times a cache hit.
 * #BUG-0007, #AVE-0018
 */
export function fresh(text: string): string {
  return `${text}\n# ${freshCount++}`;
}

/** Skips the cipher: isolates the text handling from PBKDF2. #AVE-0018 */
export const stubDecrypt = async () => ({
  plaintext: Buffer.from("s3cret-value"),
  secret: PASSWORD,
});

const native = new NativeBackend();

/** #AVE-0018 */
export const nativeDecrypt = async (ciphertext: string) => ({
  ...(await native.decrypt(ciphertext, PASSWORD)),
  secret: PASSWORD,
});

export { native as nativeBackend };

type Run = { time?: number; iterations?: number; warmupTime?: number; warmupIterations?: number };

/** tinybench defaults to at least 64 iterations, far too many for the slower detection cases. */
const DEFAULT: Run = { time: 300, iterations: 8, warmupTime: 50, warmupIterations: 2 };
export type Case = [name: string, fn: () => unknown, run?: Run];

/** Slow cases (PBKDF2 per call): a fixed, small number of iterations instead of a time budget. */
export const SLOW: Run = { time: 0, iterations: 5, warmupTime: 0, warmupIterations: 1 };

const BASELINE = process.env.AVE_BENCH_BASELINE === "1";

/**
 * One test per case. A normal run writes `build/bench/` and, where `test/bench/baseline/` has the
 * same case, prints the two side by side. `AVE_BENCH_BASELINE=1` writes the baseline instead.
 * #AVE-0018
 */
export function suite(title: string, cases: Case[]): void {
  describe(title, () => {
    for (const [name, fn, run] of cases) {
      const slug = `${title}--${name}`.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase() + ".json";
      const baseline = `test/bench/baseline/${slug}`;
      test(name, async ({ bench }) => {
        const dir = BASELINE ? "test/bench/baseline" : "build/bench";
        const opts = { ...DEFAULT, ...run };
        const now = bench(name, { writeResult: `${dir}/${slug}` }, async () => void (await fn()));
        if (BASELINE || !existsSync(baseline)) await now.run(opts);
        else await bench.compare(now, bench.from(`${name} (baseline)`, baseline), opts);
      });
    }
  });
}
