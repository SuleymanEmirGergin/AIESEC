import { describe, expect, it } from "vitest";
import { buildDigests, digestEmail } from "./digest";
import { makeSaved } from "../lib/testFactories";

const today = new Date("2026-09-26T08:00:00");
const ece = { email: "ece@ornek.org", name: "Ece", role: "member" as const };
const ali = { email: "ali@ornek.org", name: "Ali", role: "admin" as const };

describe("sabah ozeti", () => {
  const places = [
    makeSaved({ id: "1", name: "Gecikmiş", next_follow_up_at: "2026-09-24", assigned_to: ece.email }),
    makeSaved({ id: "2", name: "Bugün", next_follow_up_at: "2026-09-26", assigned_to: ece.email }),
    makeSaved({ id: "3", name: "Yarın", next_follow_up_at: "2026-09-27", assigned_to: ece.email }),
    makeSaved({ id: "4", name: "Kapandı", next_follow_up_at: "2026-09-20", assigned_to: ece.email, contact_status: "positive" }),
    makeSaved({ id: "5", name: "Sahipsiz", next_follow_up_at: "2026-09-25", assigned_to: null }),
  ];

  it("uyeye yalniz kendi gecikmis/bugunku kayitlari, yoneticiye sorumlusuzlar da gider", () => {
    const digests = buildDigests(places, [ece, ali], today);
    expect(digests.map((d) => d.to)).toEqual([ece.email, ali.email]);
    expect(digests[0].mine.map((p) => p.id)).toEqual(["1", "2"]);
    expect(digests[0].unassigned).toEqual([]);
    expect(digests[1].mine).toEqual([]);
    expect(digests[1].unassigned.map((p) => p.id)).toEqual(["5"]);
  });

  it("bos ozet gonderilmez ve e-posta adlari kacislanir", () => {
    expect(buildDigests([places[2]], [ece, ali], today)).toEqual([]);
    const [d] = buildDigests([makeSaved({ name: "<b>A&B</b>", next_follow_up_at: "2026-09-26", assigned_to: ece.email })], [ece], today);
    const mail = digestEmail(d, "https://rota.example/", today);
    expect(mail.subject).toBe("Rota: bugün 1 arama");
    expect(mail.html).toContain("&lt;b&gt;A&amp;B&lt;/b&gt;");
    expect(mail.text).toContain("https://rota.example/bugun");
  });
});
