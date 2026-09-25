import { describe, expect, it } from "vitest";
import { exportFileName } from "./api";

describe("exportFileName", () => {
  it("baslik dosya adi olur, Turkce harfler korunur", () => {
    expect(exportFileName("Kadıköy liseleri", "xlsx")).toBe("Kadıköy liseleri.xlsx");
  });

  it("baslik ayiraci dosya adinda tire olur", () => {
    expect(exportFileName("Kadıköy · Otel", "pdf")).toBe("Kadıköy - Otel.pdf");
  });

  it("dosya adinda yasak karakterler temizlenir", () => {
    expect(exportFileName('A/B: "C" <D>?*|\\', "csv")).toBe("A B C D.csv");
  });

  it("bos baslikta genel ad", () => {
    expect(exportFileName("  ", "pdf")).toBe("Kayıtlı yerler.pdf");
  });
});
