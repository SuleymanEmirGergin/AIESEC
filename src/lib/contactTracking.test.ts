import { describe, expect, it } from "vitest";
import type { SavedPlace } from "./savedApi";
import { makeSaved } from "./testFactories";
import { addDays, formatDay, getDueFollowUps, localDateInputValue, relativeDay } from "./contactTracking";

const place = (id: string, next_follow_up_at: string | null): SavedPlace =>
  makeSaved({ id, place_id: id, name: id, contact_status: "follow_up", next_follow_up_at });

const places = [
  place("this-week", "2026-08-30"), place("no-date", null), place("late", "2026-08-22"),
  place("today", "2026-08-23"), place("too-late", "2026-08-31"),
];

describe("getDueFollowUps", () => {
  it("gecikmiş, bugün ve yedi gün içindeki takipleri sıralar", () => {
    expect(getDueFollowUps(places, new Date("2026-08-23T12:00:00")).map((item) => item.id))
      .toEqual(["late", "today", "this-week"]);
  });

  it("takip tarihi olmayan veya sekiz gün sonraki kaydı dışarıda bırakır", () => {
    const due = getDueFollowUps(places, new Date("2026-08-23T12:00:00")).map((item) => item.id);
    expect(due).not.toContain("no-date");
    expect(due).not.toContain("too-late");
  });
});

it("yerel takvim gününü tarih alanı değeri olarak kullanır", () => {
  expect(localDateInputValue(new Date(2026, 0, 2, 0, 30))).toBe("2026-01-02");
});

describe("takip tarihi yardimcilari", () => {
  it("ay ve yil sinirini gecer", () => {
    expect(addDays("2026-09-25", 7)).toBe("2026-10-02");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("gunu kaydirmadan Turkce bicimler", () => {
    expect(formatDay("2026-09-25")).toMatch(/^25 Eyl/);
  });
});

describe("relativeDay", () => {
  const today = new Date("2026-09-26T15:00:00");
  it("gecmis ve gelecek gunleri insan diliyle yazar", () => {
    expect(relativeDay("2026-09-26", today)).toBe("Bugün");
    expect(relativeDay("2026-09-27", today)).toBe("Yarın");
    expect(relativeDay("2026-09-25", today)).toBe("Dün (gecikti)");
    expect(relativeDay("2026-09-23", today)).toBe("3 gün gecikti");
    expect(relativeDay("2026-10-01", today)).toBe("5 gün sonra");
  });
});
