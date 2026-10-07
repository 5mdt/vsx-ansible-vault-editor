import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { inflateSync } from "node:zlib";

const root = resolve(__dirname, "../..");
const script = join(root, "scripts/logo/pxo2png.py");
const pxo = join(root, "extension/logo.pxo");

function render(): string {
  const out = mkdtempSync(join(tmpdir(), "ave-logo-"));
  execFileSync("python3", ["-I", script, pxo, out]);
  return out;
}

// Decode an 8-bit RGBA PNG, any filter type.
function decode(buf: Buffer): { w: number; h: number; px: Buffer } {
  expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  let w = 0, h = 0;
  const idat: Buffer[] = [];
  for (let o = 8; o < buf.length; ) {
    const len = buf.readUInt32BE(o);
    const tag = buf.toString("ascii", o + 4, o + 8);
    const body = buf.subarray(o + 8, o + 8 + len);
    if (tag === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); expect(body[8]).toBe(8); expect(body[9]).toBe(6); }
    if (tag === "IDAT") idat.push(body);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * 4;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const x = raw[y * (stride + 1) + 1 + i];
      const a = i >= 4 ? px[y * stride + i - 4] : 0;
      const b = y ? px[(y - 1) * stride + i] : 0;
      const c = y && i >= 4 ? px[(y - 1) * stride + i - 4] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      px[y * stride + i] = (x + [0, a, b, (a + b) >> 1, paeth][f]) & 255;
    }
  }
  return { w, h, px };
}

describe("logo export", () => {
  // #AVE-0017
  it.each(["logo.png", "logo_x2.png", "logo_x4.png"])("%s matches the committed icon", (name) => {
    const got = decode(readFileSync(join(render(), name)));
    const want = decode(readFileSync(join(root, "extension", name)));
    expect([got.w, got.h]).toEqual([want.w, want.h]);
    expect(got.px.equals(want.px)).toBe(true);
  });

  // #AVE-0017
  it("favicon.ico holds 16, 32 and 64 pixel PNGs", () => {
    const ico = readFileSync(join(render(), "favicon.ico"));
    expect([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)]).toEqual([0, 1, 3]);
    const sizes = [0, 1, 2].map((i) => {
      const e = 6 + 16 * i;
      const img = decode(ico.subarray(ico.readUInt32LE(e + 12), ico.readUInt32LE(e + 12) + ico.readUInt32LE(e + 8)));
      expect(img.w).toBe(img.h);
      return img.w;
    });
    expect(sizes).toEqual([16, 32, 64]);
  });

  // #AVE-0017
  it("fails on a missing source instead of writing output", () => {
    const r = spawnSync("python3", ["-I", script, join(tmpdir(), "nope.pxo"), mkdtempSync(join(tmpdir(), "ave-logo-"))]);
    expect(r.status).not.toBe(0);
  });

  // Build a 2x2 .pxo with two full-red layers; `tweak` edits the second layer's metadata.
  function synthetic(tweak: string): string {
    const dir = mkdtempSync(join(tmpdir(), "ave-pxo-"));
    const file = join(dir, "t.pxo");
    const code = `
import json, sys, zipfile
layers = [dict(name="a", type=0, visible=True, opacity=1.0, blend_mode=0) for _ in range(2)]
${tweak}
meta = dict(size_x=2, size_y=2, color_mode=5, layers=layers, frames=[dict(cels=[dict(opacity=1.0)] * 2)])
with zipfile.ZipFile(sys.argv[1], "w") as z:
    z.writestr("data.json", json.dumps(meta))
    z.writestr("image_data/frames/1/layer_1", bytes([255, 0, 0, 255] * 4))
    z.writestr("image_data/frames/1/layer_2", bytes([0, 0, 255, 255] * 4))
`;
    execFileSync("python3", ["-I", "-c", code, file]);
    return file;
  }

  function pixel(file: string) {
    const out = mkdtempSync(join(tmpdir(), "ave-logo-"));
    const r = spawnSync("python3", ["-I", script, file, out]);
    return { status: r.status, png: r.status === 0 ? decode(readFileSync(join(out, "logo.png"))).px.subarray(0, 4) : null };
  }

  // #AVE-0017
  it("composites the top layer, and skips a hidden one", () => {
    expect([...pixel(synthetic("")).png!]).toEqual([0, 0, 255, 255]);
    expect([...pixel(synthetic('layers[1]["visible"] = False')).png!]).toEqual([255, 0, 0, 255]);
  });

  // #AVE-0017
  it("fails on an unsupported blend mode", () => {
    expect(pixel(synthetic('layers[1]["blend_mode"] = 3')).status).not.toBe(0);
  });
});
