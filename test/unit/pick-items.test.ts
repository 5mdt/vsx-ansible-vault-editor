import { describe, expect, it } from "vitest";
import { pickerItems } from "../../src/secrets/pick-items";
import { failureText } from "../../src/util";

// #AVE-0004, #AVE-0009
describe("pickerItems", () => {
  it("puts the default first, keeps the rest in order, then the extras", () => {
    const items = pickerItems(["a", "b", "c"], "b", ["(none)", "New"]);
    expect(items.map((i) => i.label)).toEqual(["b", "a", "c", "(none)", "New"]);
    expect(items[0].description).toBe("(default)");
    expect(items[1].description).toBe("");
  });
  it("keeps order when there is no default", () => {
    const items = pickerItems(["a", "b"], undefined, ["(none)"]);
    expect(items.map((i) => i.label)).toEqual(["a", "b", "(none)"]);
  });
  it("sorts a default extra-less list too", () => {
    expect(pickerItems(["x", "y"], "y", []).map((i) => i.label)).toEqual(["y", "x"]);
  });
});

// #AVE-0005, #AVE-0006, #AVE-0010
describe("failureText", () => {
  it("is undefined when nothing failed", () => {
    expect(failureText([])).toBeUndefined();
  });
  it("joins with semicolons under the Ansible Vault prefix", () => {
    expect(failureText(["a: x", "b: y"])).toBe("Ansible Vault: a: x; b: y");
  });
  it("accepts a lead-in", () => {
    expect(failureText(["a: x"], "not rekeyed: ")).toBe("Ansible Vault: not rekeyed: a: x");
  });
});
