import { describe, expect, it } from "vitest";
import { EMPTY_FILTER, filterSaved, followUpBucket, paginate, type SavedFilter } from "./savedFilters";
import { makeSaved } from "./testFactories";

const TODAY = new Date("2026-09-26T10:00:00");

const places = [
  makeSaved({ id: "a", name: "Özel Çınar Koleji", tags: { phone: "+90 212 555 11 22" }, district_id: "d1", district_name: "Bakırköy",
    saved_by: "Ece", assigned_to: "ayse@ornek.org", assigned_name: "Ayşe", contact_status: "follow_up", next_follow_up_at: "2026-09-25", list_id: "L1" }),
  makeSaved({ id: "b", name: "Deniz Oteli", note: "müdür yardımcısı ilgilendi", district_id: "d2", district_name: "Fatih",
    saved_by: "Deniz", contact_status: "contacted", next_follow_up_at: "2026-09-26", place_type: "hotel" }),
  makeSaved({ id: "c", name: "Mavi Emlak", district_id: "d1", district_name: "Bakırköy", saved_by: "Ece",
    assigned_to: "emir@ornek.org", assigned_name: "Emir", next_follow_up_at: "2026-09-30", place_type: "real_estate", list_id: "L1" }),
  makeSaved({ id: "d", name: "Sarı Atölye", saved_by: "Deniz", contact_status: "positive", next_follow_up_at: "2026-09-20" }),
];

const run = (f: Partial<SavedFilter>, me = "emir@ornek.org") =>
  filterSaved(places, { ...EMPTY_FILTER, ...f }, me, TODAY).map((p) => p.id);

describe("filterSaved", () => {
  it("filtre yokken hepsi", () => expect(run({})).toEqual(["a", "b", "c", "d"]));

  it("arama ad, telefon, not ve ilcede; Turkce harfe duyarsiz", () => {
    expect(run({ q: "ozel cinar" })).toEqual(["a"]);
    expect(run({ q: "555 11" })).toEqual(["a"]);
    expect(run({ q: "mudur" })).toEqual(["b"]);
    expect(run({ q: "bakirkoy" })).toEqual(["a", "c"]);
    expect(run({ q: "AYŞE" })).toEqual(["a"]);
  });

  it("liste, durum, ilce, kaydeden ve tur", () => {
    expect(run({ listId: "L1" })).toEqual(["a", "c"]);
    expect(run({ listId: "unfiled" })).toEqual(["b", "d"]);
    expect(run({ status: "contacted" })).toEqual(["b"]);
    expect(run({ district: "d2" })).toEqual(["b"]);
    expect(run({ savedBy: "Deniz" })).toEqual(["b", "d"]);
    expect(run({ types: ["hotel", "real_estate"] })).toEqual(["b", "c"]);
  });

  it("sorumlu: bana atananlar, atanmamis, belirli kisi", () => {
    expect(run({ assignee: "me" })).toEqual(["c"]);
    expect(run({ assignee: "none" })).toEqual(["b", "d"]);
    expect(run({ assignee: "ayse@ornek.org" })).toEqual(["a"]);
  });

  it("takip: gecikmis ve bugun kapanmis kayitlari saymaz", () => {
    expect(run({ followUp: "overdue" })).toEqual(["a"]);
    expect(run({ followUp: "today" })).toEqual(["b"]);
    expect(run({ followUp: "week" })).toEqual(["a", "b", "c"]);
  });

  it("filtreler birlesir", () => expect(run({ district: "d1", assignee: "me" })).toEqual(["c"]));
});

describe("followUpBucket", () => {
  it("olumlu/uygun degil kayitlarda takip yok", () => {
    expect(followUpBucket(places[3], TODAY)).toBeNull();
    expect(followUpBucket(places[0], TODAY)).toBe("overdue");
    expect(followUpBucket(places[1], TODAY)).toBe("today");
    expect(followUpBucket(places[2], TODAY)).toBe("week");
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 125 }, (_, i) => i);
  it("sayfa boyuna boler ve tasani sinirlar", () => {
    expect(paginate(items, 1, 50)).toMatchObject({ page: 1, pages: 3 });
    expect(paginate(items, 3, 50).items).toEqual(items.slice(100));
    expect(paginate(items, 9, 50).page).toBe(3);
    expect(paginate([], 1, 50)).toMatchObject({ page: 1, pages: 1, items: [] });
  });
});
