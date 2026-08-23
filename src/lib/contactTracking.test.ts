import { describe, expect, it } from "vitest";
import type { SavedPlace } from "./savedApi";
import { getDueFollowUps } from "./contactTracking";

const place = (id: string, next_follow_up_at: string | null): SavedPlace => ({
  id, list_id: null, place_id: id, name: id, place_type: "high_school", lat: 0, lon: 0,
  address: null, tags: {}, note: null, saved_by: null, contact_status: "follow_up",
  last_contact_at: null, next_follow_up_at, created_at: "2026-08-01T00:00:00",
});

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
