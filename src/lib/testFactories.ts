import type { SavedPlace } from "./savedApi";

/** Testler icin eksiksiz bir kayitli yer; yalnizca degisen alanlar verilir. */
export function makeSaved(overrides: Partial<SavedPlace> = {}): SavedPlace {
  return {
    id: "saved-1",
    list_id: null,
    place_id: "osm:node:1",
    name: "Kadıköy Anadolu Lisesi",
    place_type: "high_school",
    lat: 40.99,
    lon: 29.03,
    address: null,
    tags: {},
    note: null,
    saved_by: null,
    contact_status: "uncontacted",
    last_contact_at: null,
    next_follow_up_at: null,
    assigned_to: null,
    assigned_name: null,
    assigned_by: null,
    assigned_at: null,
    district_id: null,
    district_name: null,
    created_at: "2026-08-23T00:00:00Z",
    ...overrides,
  };
}
