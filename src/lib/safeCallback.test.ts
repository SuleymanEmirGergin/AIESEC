import { describe, expect, it } from "vitest";
import { safeCallback } from "./safeCallback";

describe("safeCallback", () => {
  it("site ici yolu korur", () => {
    expect(safeCallback(undefined)).toBe("/");
    expect(safeCallback("/kayitli?ara=x")).toBe("/kayitli?ara=x");
    expect(safeCallback("https://aiesec-web.vercel.app/ekip")).toBe("/ekip");
  });

  it("baska siteye yonlendirmez", () => {
    expect(safeCallback("https://kotu.example")).toBe("/");
    expect(safeCallback("//kotu.example")).toBe("/");
    expect(safeCallback("https://x//kotu.example")).toBe("/");
    expect(safeCallback("/\\kotu.example")).toBe("/");
    expect(safeCallback("https://x/\\/kotu.example")).toBe("/");
  });
});
