import { describe, expect, it } from "vitest";
import {
  afterEncrypt,
  answerDialog,
  closeDialog,
  hold,
  initialFlags,
  openDialog,
  planStep,
  settleHeld,
  takeRestore,
  type GuardFlags,
  type SaveInput,
} from "../../src/guard/state";
import type { GuardReason } from "../../src/guard/snapshot";

const input = (reasons: GuardReason[], over: Partial<SaveInput> = {}): SaveInput => ({
  text: "buf",
  mode: "warn",
  transparent: false,
  reasons: () => reasons,
  ...over,
});
const flags = (over: Partial<GuardFlags> = {}): GuardFlags => ({ ...initialFlags(), ...over });

// #AVE-0009, #AVE-0011, #AVE-0013
describe("guard state: planStep", () => {
  it("override writes the rekeyed text, consumes it, and restores the buffer; reasons never read", () => {
    const step = planStep(flags({ override: "rk", allow: "plain" }), {
      ...input([]),
      reasons: () => {
        throw new Error("not lazy");
      },
    });
    expect(step).toEqual({
      kind: "write",
      text: "rk",
      flags: { pending: false, held: false, override: undefined, allow: "plain", restore: "buf" },
    });
  });

  it("override beats allow and a pending dialog", () => {
    const step = planStep(flags({ override: "", pending: true }), input(["marker"]));
    expect(step.kind).toBe("write");
  });

  it("allow=plain writes the buffer, consumes allow, and skips the reasons", () => {
    const step = planStep(flags({ allow: "plain" }), {
      ...input([]),
      reasons: () => {
        throw new Error("not lazy");
      },
    });
    expect(step.kind).toBe("buffer");
    expect(step.flags.allow).toBeUndefined();
  });

  it("allow=encrypt with reasons encrypts and consumes allow", () => {
    const step = planStep(flags({ allow: "encrypt" }), input(["was-vaulted"], { mode: "off" }));
    expect(step).toMatchObject({ kind: "encrypt", warn: true });
    expect(step.flags.allow).toBeUndefined();
  });

  it("allow=encrypt without reasons writes the buffer and consumes allow", () => {
    const step = planStep(flags({ allow: "encrypt" }), input([]));
    expect(step.kind).toBe("buffer");
    expect(step.flags.allow).toBeUndefined();
  });

  it("no reasons writes the buffer, flags untouched", () => {
    const f = flags();
    expect(planStep(f, input([]))).toEqual({ kind: "buffer", flags: f });
  });

  it("reasons with mode off write the buffer", () => {
    expect(planStep(flags(), input(["glob"], { mode: "off" })).kind).toBe("buffer");
  });

  it("marker-only reasons in transparent mode encrypt", () => {
    expect(planStep(flags(), input(["marker"], { transparent: true }))).toMatchObject({
      kind: "encrypt",
      warn: true,
    });
  });

  it("marker-only reasons outside transparent mode go to the dialog", () => {
    expect(planStep(flags(), input(["marker"]))).toMatchObject({
      kind: "hold",
      decision: "dialog",
      warn: true,
    });
  });

  it("mixed reasons in transparent mode go to the dialog", () => {
    expect(planStep(flags(), input(["marker", "glob"], { transparent: true }))).toMatchObject({
      kind: "hold",
      decision: "dialog",
    });
  });

  it("block mode with reasons goes to the dialog", () => {
    expect(planStep(flags(), input(["was-vaulted"], { mode: "block" })).kind).toBe("hold");
  });

  it("does not mutate its input flags", () => {
    const f = flags({ allow: "encrypt" });
    planStep(f, input(["glob"]));
    expect(f.allow).toBe("encrypt");
  });
});

// #AVE-0011, #AVE-0013
describe("guard state: hold and encrypt outcomes", () => {
  it("afterEncrypt restores the plaintext only in transparent mode", () => {
    expect(afterEncrypt(flags(), "buf", true).restore).toBe("buf");
    expect(afterEncrypt(flags(), "buf", false).restore).toBeUndefined();
  });

  it("hold with a dialog decision sets restore and held", () => {
    expect(hold(flags(), "buf", "dialog")).toMatchObject({ restore: "buf", held: true });
  });

  it("hold after a failed encrypt restores but does not ask", () => {
    expect(hold(flags(), "buf", "encrypt")).toMatchObject({ restore: "buf", held: false });
  });

  it("hold after a failed encrypt keeps an existing held", () => {
    expect(hold(flags({ held: true }), "buf", "encrypt").held).toBe(true);
  });
});

// #AVE-0011, #AVE-0013
describe("guard state: after the save", () => {
  it("takeRestore yields the text once and clears it", () => {
    const r = takeRestore(flags({ restore: "plain" }));
    expect(r.text).toBe("plain");
    expect(r.flags.restore).toBeUndefined();
  });

  it("takeRestore restores an empty string", () => {
    expect(takeRestore(flags({ restore: "" })).text).toBe("");
  });

  it("takeRestore with nothing to restore is a no-op", () => {
    const f = flags();
    expect(takeRestore(f)).toEqual({ flags: f });
  });

  it("settleHeld asks when held and no dialog is open, clearing held", () => {
    expect(settleHeld(flags({ held: true }))).toEqual({ ask: true, flags: flags({ held: false }) });
  });

  it("settleHeld only clears held while a dialog is already open (the held/pending overlap)", () => {
    expect(settleHeld(flags({ held: true, pending: true }))).toEqual({
      ask: false,
      flags: flags({ held: false, pending: true }),
    });
  });

  it("settleHeld without held does nothing", () => {
    const f = flags({ pending: true });
    expect(settleHeld(f)).toEqual({ ask: false, flags: f });
  });
});

// #AVE-0011
describe("guard state: dialog", () => {
  it("open and close toggle pending", () => {
    expect(openDialog(flags()).pending).toBe(true);
    expect(closeDialog(flags({ pending: true })).pending).toBe(false);
  });

  it("Re-encrypt and save allows encrypt and saves", () => {
    const r = answerDialog(flags(), "Re-encrypt and save");
    expect(r.save).toBe(true);
    expect(r.flags.allow).toBe("encrypt");
  });

  it("Save anyway allows plain and saves", () => {
    const r = answerDialog(flags(), "Save anyway");
    expect(r.save).toBe(true);
    expect(r.flags.allow).toBe("plain");
  });

  it("dismissing or an unknown pick saves nothing and sets no allow", () => {
    for (const pick of [undefined, "Cancel"]) {
      const r = answerDialog(flags(), pick);
      expect(r.save).toBe(false);
      expect(r.flags.allow).toBeUndefined();
    }
  });
});
