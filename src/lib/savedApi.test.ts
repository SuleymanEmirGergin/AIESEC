import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addContactEvent,
  createList,
  fetchContactEvents,
  fetchLists,
  fetchSavedPlaces,
  savePlace,
  savePlaces,
  savedToPlace,
  type SavedPlace,
} from "./savedApi";

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
  contact_status: "uncontacted",
  last_contact_at: null,
  next_follow_up_at: null,
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

  it("liste olustururken gonullu adini iletir", async () => {
    localStorage.setItem("volunteer_name", "Ece");
    const spy = mockFetch({});

    await createList("Okullar");

    expect(spy.mock.calls[0][1].headers).toMatchObject({ "X-VOLUNTEER-NAME": "Ece" });
  });

  it("ilk kez yer kaydederken gonullu adini iletir", async () => {
    localStorage.setItem("volunteer_name", "Ece");
    const spy = mockFetch(savedPlace);

    await savePlace({
      id: "osm:node:1",
      name: "Kadıköy Anadolu Lisesi",
      type: "high_school",
      coordinates: { lat: 40.99, lng: 29.03 },
      address: "Kadıköy, İstanbul",
      tags: {},
    });

    expect(spy.mock.calls[0][1].headers).toMatchObject({ "X-VOLUNTEER-NAME": "Ece" });
  });

  it("toplu kayitta hepsini tek istekte, tekli ile ayni govdeyle gonderir", async () => {
    localStorage.setItem("volunteer_name", "Ece");
    const spy = mockFetch({ created: 2, ids: { a: "s-a", b: "s-b" } });
    const base = { type: "hotel", address: "Merkez", tags: {} } as const;

    const result = await savePlaces([
      { ...base, id: "a", name: "A", coordinates: { lat: 1, lng: 2 } },
      { ...base, id: "b", name: "B", coordinates: { lat: 3, lng: 4 } },
    ]);

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("/api/saved/bulk");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "X-VOLUNTEER-NAME": "Ece" });
    expect(JSON.parse(init.body).items).toEqual([
      { place_id: "a", name: "A", place_type: "hotel", lat: 1, lon: 2, address: "Merkez", tags: {} },
      { place_id: "b", name: "B", place_type: "hotel", lat: 3, lon: 4, address: "Merkez", tags: {} },
    ]);
    expect(result.ids).toEqual({ a: "s-a", b: "s-b" });
    expect(JSON.parse(init.body).list_id).toBeNull();
  });

  it("toplu kayitta secilen listeyi iletir", async () => {
    localStorage.setItem("volunteer_name", "Ece");
    const spy = mockFetch({ created: 1, ids: { a: "s-a" } });

    await savePlaces(
      [{ id: "a", name: "A", type: "hotel", address: "Merkez", tags: {}, coordinates: { lat: 1, lng: 2 } }],
      "list-7"
    );

    expect(JSON.parse(spy.mock.calls[0][1].body).list_id).toBe("list-7");
  });

  it("temas eklerken gonullu adini iletir", async () => {
    localStorage.setItem("volunteer_name", "Ece");
    const spy = mockFetch(savedPlace);

    await addContactEvent("saved-1", { status: "contacted", contacted_at: "2026-08-23" });

    expect(spy.mock.calls[0][1].headers).toMatchObject({ "X-VOLUNTEER-NAME": "Ece" });
  });

  it("isim yokken yazma istegini gondermeden reddeder", async () => {
    const spy = mockFetch(savedPlace);

    await expect(
      addContactEvent("saved-1", { status: "contacted", contacted_at: "2026-08-23" })
    ).rejects.toThrow("Gönüllü adınızı Ayarlar'dan girin.");

    expect(spy).not.toHaveBeenCalled();
  });

  it("temas gecmisini ad olmadan dogru yoldan okur", async () => {
    const spy = mockFetch([]);

    await fetchContactEvents("saved id");

    expect(spy).toHaveBeenCalledWith(
      "/api/saved/saved%20id/contacts",
      expect.objectContaining({ method: "GET" })
    );
    expect(spy.mock.calls[0][1].headers).not.toHaveProperty("X-VOLUNTEER-NAME");
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
