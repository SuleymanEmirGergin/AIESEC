import { describe, expect, it } from "vitest";
import { envAdmins, normalizeEmail } from "./team";

describe("onayli e-posta yardimcilari", () => {
  it("buyuk harf ve bosluklari esitler; bicimsizi reddeder", () => {
    expect(normalizeEmail("  Ece.Yilmaz@AIESEC.net ")).toBe("ece.yilmaz@aiesec.net");
    expect(normalizeEmail("ece@")).toBeNull();
    expect(normalizeEmail("ece yilmaz@aiesec.net")).toBeNull();
  });

  it("ADMIN_EMAILS virgul ya da boslukla ayrilir, gecersizler atlanir", () => {
    expect([...envAdmins("A@x.com, b@y.org  gecersiz")]).toEqual(["a@x.com", "b@y.org"]);
    expect(envAdmins("").size).toBe(0);
  });
});
