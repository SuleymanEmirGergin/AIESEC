import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPlacesParams,
  fetchDistrictPlaces,
  fetchDistrictSummary,
} from "./districts";

function mockFetch(body: unknown, ok = true, status = 200) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("buildPlacesParams", () => {
  it("bos sorgu bos parametre uretir", () => {
    expect(buildPlacesParams({}).toString()).toBe("");
  });

  it("turleri virgulle birlestirir", () => {
    expect(buildPlacesParams({ types: ["factory", "office"] }).get("types")).toBe(
      "factory,office"
    );
  });

  it("bos tur dizisini gondermez", () => {
    expect(buildPlacesParams({ types: [] }).has("types")).toBe(false);
  });

  it("yalnizca etkin boolean filtrelerini gonderir", () => {
    const inactive = buildPlacesParams({ hasContact: false, namedOnly: false });
    const active = buildPlacesParams({ hasContact: true, namedOnly: true });

    expect(inactive.has("has_contact")).toBe(false);
    expect(inactive.has("named_only")).toBe(false);
    expect(active.get("has_contact")).toBe("true");
    expect(active.get("named_only")).toBe("true");
  });

  it("includeBuffer yalnizca false iken gonderir", () => {
    expect(buildPlacesParams({ includeBuffer: true }).has("include_buffer")).toBe(false);
    expect(buildPlacesParams({ includeBuffer: false }).get("include_buffer")).toBe("false");
  });

  it("anlamli esik ve metin filtrelerini gonderir", () => {
    const empty = buildPlacesParams({ minConfidence: 0, q: "  " });
    const filled = buildPlacesParams({ minConfidence: 40, q: " alfa " });

    expect(empty.has("min_confidence")).toBe(false);
    expect(empty.has("q")).toBe(false);
    expect(filled.get("min_confidence")).toBe("40");
    expect(filled.get("q")).toBe("alfa");
  });

  it("siralama, referans ve sayfalama degerlerini gonderir", () => {
    const params = buildPlacesParams({
      sort: "lead_score",
      refLat: 40.99,
      refLon: 29.03,
      limit: 100,
      offset: 200,
    });

    expect(params.get("sort")).toBe("lead_score");
    expect(params.get("ref_lat")).toBe("40.99");
    expect(params.get("ref_lon")).toBe("29.03");
    expect(params.get("limit")).toBe("100");
    expect(params.get("offset")).toBe("200");
  });
});

describe("fetchDistricts", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("districts dizisini cikarir", async () => {
    mockFetch({ districts: [{ id: "tr-34-kadikoy", name: "Kadıköy" }] });
    const { fetchDistricts } = await import("./districts");

    const result = await fetchDistricts();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("tr-34-kadikoy");
  });

  it("backend'in ic ice ingest alanini duz alanlara acar", async () => {
    // Backend durumu `ingest: {...}` icinde veriyor; sihirbaz kayit sayisini
    // ve "veri yok" uyarisini duz alanlardan okuyor. Eskiden hep "0" gorunuyordu.
    mockFetch({
      districts: [
        { id: "a", name: "A", ingest: { fetched_at: "2026-09-24T18:16:26", place_count: 2532, status: "ok", age_days: 1, stale: false } },
        { id: "b", name: "B", ingest: null },
      ],
    });
    const { fetchDistricts } = await import("./districts");

    const [a, b] = await fetchDistricts();

    expect(a).toMatchObject({ fetched_at: "2026-09-24T18:16:26", place_count: 2532, status: "ok" });
    expect(b).toMatchObject({ fetched_at: null, place_count: null, status: null });
  });

  it("backend hata mesajini firlatir", async () => {
    mockFetch({ message: "Backend'e ulasilamadi." }, false, 502);
    const { fetchDistricts } = await import("./districts");

    await expect(fetchDistricts()).rejects.toThrow("Backend'e ulasilamadi.");
  });
});

describe("fetchDistrictPlaces", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("kodlanmis ilce kimligi ve sorgu ile dogru yola gider", async () => {
    const spy = mockFetch({ results: [], count: 0, total: 0, query: {} });

    await fetchDistrictPlaces("tr-34-a b", { types: ["factory"] });

    expect(spy.mock.calls[0][0]).toBe(
      "/api/districts/tr-34-a%20b/places?types=factory"
    );
  });

  it("abort sinyalini fetch'e iletir", async () => {
    const spy = mockFetch({ results: [], count: 0, total: 0, query: {} });
    const controller = new AbortController();

    await fetchDistrictPlaces("tr-34-kadikoy", {}, controller.signal);

    expect(spy.mock.calls[0][1].signal).toBe(controller.signal);
  });
});

describe("fetchDistrictSummary", () => {
  it("sayimlari dondurur ve ilce kimligini kodlar", async () => {
    const spy = mockFetch({
      district_id: "tr-34-kadikoy",
      name: "Kadıköy",
      counts: { factory: 34, office: 121 },
      total: 155,
      fetched_at: null,
      place_count: 155,
      status: "ok",
    });

    const summary = await fetchDistrictSummary("tr-34-a b", false);

    expect(summary.total).toBe(155);
    expect(spy.mock.calls[0][0]).toBe(
      "/api/districts/tr-34-a%20b/summary?include_buffer=false"
    );
  });
});
