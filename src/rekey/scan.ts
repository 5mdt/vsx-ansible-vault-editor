// #AVE-0010: what the workspace scan finds and how the preview describes it.

import { itemsIn } from "./rekey";

export interface ScanEntry {
  kind: "file" | "blocks";
  /** Block count for `blocks`, 1 for a file. */
  count: number;
  /** Current vault IDs; "" stands for the 1.1 header without an ID. */
  vaultIds: string[];
}

// #AVE-0010
export function scanText(text: string): ScanEntry | undefined {
  const items = itemsIn(text);
  if (items.kind === "none") return undefined;
  if (items.kind === "file") return { kind: "file", count: 1, vaultIds: [items.vaultId ?? ""] };
  return {
    kind: "blocks",
    count: items.blocks.length,
    vaultIds: [...new Set(items.blocks.map((b) => b.vaultId ?? ""))],
  };
}

/** One glob for `findFiles`' exclude argument from `files.exclude` and `ansibleVault.rekeyExclude`. */
// #AVE-0010
export function excludeGlob(
  filesExclude: Record<string, boolean>,
  rekeyExclude: string[],
): string | undefined {
  const globs = [
    ...Object.entries(filesExclude)
      .filter(([, on]) => on)
      .map(([g]) => g),
    ...rekeyExclude,
  ];
  if (!globs.length) return undefined;
  return globs.length === 1 ? globs[0] : `{${globs.join(",")}}`;
}

/** The vault IDs found, each with how many items carry it. */
// #AVE-0010
export function idCounts(entries: ScanEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of entries) for (const id of e.vaultIds) out.set(id, (out.get(id) ?? 0) + 1);
  return out;
}

/** Entries with at least one item under `id`; undefined keeps everything. */
// #AVE-0010
export function filterById<T extends { entry: ScanEntry }>(
  items: T[],
  id: string | undefined,
): T[] {
  return id === undefined ? items : items.filter((i) => i.entry.vaultIds.includes(id));
}

// #AVE-0010
export function previewTitle(entries: ScanEntry[]): string {
  const blocks = entries.reduce((n, e) => n + (e.kind === "blocks" ? e.count : 0), 0);
  return `Rekey workspace: ${entries.length} files, ${blocks} blocks`;
}

/**
 * Map `items` with at most `limit` calls in flight; results keep input order.
 * #BUG-0010, #AVE-0010
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/** True when a file's leading bytes contain a NUL: binary, never vaulted text. #BUG-0010, #AVE-0010 */
export function looksBinary(prefix: Uint8Array): boolean {
  return prefix.includes(0);
}
