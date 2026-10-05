// #AVE-0015: what the opt-in `git diff` driver writes, as pure text.

export const DRIVER = "ansible-vault";
const BEGIN = "# ansible-vault (managed) begin";
const END = "# ansible-vault (managed) end";

/** `git config --local` keys the driver sets; the textconv value comes from `textconvCommand`. */
// #AVE-0015
export const CONFIG_KEYS = {
  textconv: `diff.${DRIVER}.textconv`,
  cache: `diff.${DRIVER}.cachetextconv`,
} as const;

const quote = (s: string) => `"${s.replace(/(["\\$`])/g, "\\$1")}"`;

// #AVE-0015
export function textconvCommand(shim: string, passwordFile?: string): string {
  const pw = passwordFile ? ` --password-file ${quote(passwordFile)}` : "";
  return `node ${quote(shim)}${pw}`;
}

// #AVE-0015
export function withoutManagedAttributes(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (line === BEGIN) inside = true;
    else if (line === END) inside = false;
    else if (!inside) out.push(line);
  }
  return out.join("\n");
}

/** The attributes file with our block (re)written; foreign lines are untouched. */
// #AVE-0015
export function withManagedAttributes(text: string, globs: string[]): string {
  const base = withoutManagedAttributes(text).replace(/\n*$/, "");
  const block = [BEGIN, ...globs.map((g) => `${g} diff=${DRIVER}`), END].join("\n");
  return (base ? `${base}\n` : "") + `${block}\n`;
}
