import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchLists, fetchSavedPlaces, savedToPlace, type SavedPlace } from "./savedApi";

function mockFetch(body: unknown, ok = true, status = 200) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

const savedPlace: SavedPlace = {
  id: "saved-1",
  list_id: null,
  place_id: "osm:node:1",
  name: "Kadıköy Anadolu Lisesi",
  place_type: "high_school",
  lat: 40.99,
  lon: 29.03,
  address: "Kadıköy, İstanbul",
  tags: { phone: "+90 216 000 00 00" },
  note: null,
  saved_by: "test",
  created_at: "2026-08-23T00:00:00Z",
};

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("saved API client", () => {
  it("backend hata mesajini firlatir", async () => {
    mockFetch({ message: "Liste okunamadı." }, false, 422);

    await expect(fetchLists()).rejects.toThrow("Liste okunamadı.");
  });

  it("anahtar varken X-API-KEY basligini gonderir", async () => {
    localStorage.setItem("api_key", "team-key");
    const spy = mockFetch([]);

    await fetchSavedPlaces();

    expect(spy.mock.calls[0][1].headers).toMatchObject({ "X-API-KEY": "team-key" });
  });

  it("anahtar yokken X-API-KEY basligini gondermez", async () => {
    const spy = mockFetch([]);

    await fetchSavedPlaces();

    expect(spy.mock.calls[0][1].headers).not.toHaveProperty("X-API-KEY");
  });

  it("kayitli yeri arama sonucu seklinde dondurur", () => {
    expect(savedToPlace(savedPlace)).toEqual({
      id: "osm:node:1",
      name: "Kadıköy Anadolu Lisesi",
      type: "high_school",
      coordinates: { lat: 40.99, lng: 29.03 },
      address: "Kadıköy, İstanbul",
      tags: { phone: "+90 216 000 00 00" },
    });
  });
});
