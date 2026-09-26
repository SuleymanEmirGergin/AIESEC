import { describe, expect, it } from "vitest";
import { whatsappHref } from "./contact";

describe("whatsappHref", () => {
  it("Turkiye cep numarasini wa.me baglantisina cevirir", () => {
    expect(whatsappHref("+90 532 111 22 33")).toBe("https://wa.me/905321112233");
    expect(whatsappHref("0532 111 22 33")).toBe("https://wa.me/905321112233");
    expect(whatsappHref("5321112233")).toBe("https://wa.me/905321112233");
    expect(whatsappHref("+90 532 111 22 33; +90 212 555 00 00")).toBe("https://wa.me/905321112233");
  });

  it("sabit hat ve bicimsiz numarada baglanti yok", () => {
    expect(whatsappHref("+90 212 555 00 00")).toBeNull();
    expect(whatsappHref("(0212) 574 44 47")).toBeNull();
    expect(whatsappHref("123")).toBeNull();
    expect(whatsappHref("")).toBeNull();
  });
});
