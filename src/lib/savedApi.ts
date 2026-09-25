import type { Place, PlaceType } from "./types";
import { TimeoutError, withTimeout } from "./fetchTimeout";

/**
 * Kayitli yerler, listeler ve disa aktarim gecmisi icin istemci katmani.
 *
 * Bu uclar yerel veritabanina gidiyor (Overpass beklemesi yok), bu yuzden
 * sinir arama ucundakinden cok daha kisa.
 */

const TIMEOUT_MS = 15_000;

const getApiKey = () =>
  typeof window !== "undefined" ? localStorage.getItem("api_key") : null;

/** Gönüllünün tarayıcıdaki görünen adı; boşluklardan ibaret değerler geçersizdir. */
export function getVolunteerName(): string | null {
  const value = typeof window === "undefined" ? null : localStorage.getItem("volunteer_name");
  return value?.trim() || null;
}

async function request<T>(
  url: string,
  options: { method?: string; body?: unknown; requireVolunteer?: boolean; volunteer?: boolean } = {}
): Promise<T> {
  const apiKey = getApiKey();
  const volunteerName = getVolunteerName();
  if (options.requireVolunteer && !volunteerName) {
    throw new Error("Gönüllü adınızı Ayarlar'dan girin.");
  }
  const timeout = withTimeout(TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(apiKey ? { "X-API-KEY": apiKey } : {}),
        ...((options.volunteer || options.requireVolunteer) && volunteerName
          ? { "X-VOLUNTEER-NAME": volunteerName }
          : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: timeout.signal,
    });
  } catch (error: any) {
    if (error?.name === "AbortError" && timeout.timedOut()) {
      throw new TimeoutError(TIMEOUT_MS);
    }
    throw error;
  } finally {
    timeout.cleanup();
  }

  if (!response.ok) {
    const detail = await response
      .json()
      .catch(() => null);
    throw new Error(detail?.message || "İstek başarısız oldu.");
  }

  // DELETE uclari da JSON donuyor, ama bos govdeye karsi korumali olalim.
  return (await response.json().catch(() => null)) as T;
}

export interface PlaceListSummary {
  id: string;
  name: string;
  note: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  place_count: number;
}

export interface SavedPlace {
  id: string;
  list_id: string | null;
  place_id: string;
  name: string | null;
  place_type: string | null;
  lat: number;
  lon: number;
  address: string | null;
  tags: Record<string, string>;
  note: string | null;
  saved_by: string | null;
  contact_status: ContactStatus;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
  created_at: string;
}

export type ContactStatus =
  | "uncontacted"
  | "preparing"
  | "contacted"
  | "follow_up"
  | "positive"
  | "not_suitable";

export interface ContactEventCreate {
  status: ContactStatus;
  contacted_at: string;
  note?: string | null;
  next_follow_up_at?: string | null;
}

export interface ContactEvent {
  id: string;
  saved_place_id: string;
  status: ContactStatus;
  contacted_at: string;
  note: string | null;
  next_follow_up_at: string | null;
  volunteer_name: string;
  created_at: string;
}

export interface ExportHistoryItem {
  id: number;
  created_at: string;
  type: string;
  item_count: number;
  center_lat: number;
  center_lon: number;
  radius: number;
}

// --- Listeler ---------------------------------------------------------------

export const fetchLists = () => request<PlaceListSummary[]>("/api/lists");

export const createList = (name: string, note?: string) =>
  request<PlaceListSummary>("/api/lists", {
    method: "POST",
    body: { name, note: note || null },
    requireVolunteer: true,
  });

export const renameList = (id: string, name: string) =>
  request<PlaceListSummary>(`/api/lists/${id}`, {
    method: "PATCH",
    body: { name },
  });

/** Liste silinir, icindeki yerler dosyalanmamisa duser (silinmez). */
export const deleteList = (id: string) =>
  request<{ success: boolean; released_places: number }>(`/api/lists/${id}`, {
    method: "DELETE",
  });

// --- Kayitli yerler ---------------------------------------------------------

export const fetchSavedPlaces = (listId?: string) =>
  request<SavedPlace[]>(
    listId ? `/api/saved?list_id=${encodeURIComponent(listId)}` : "/api/saved"
  );

/**
 * Bir yeri kaydeder.
 *
 * Yerin tamami gonderiliyor, yalnizca id degil: kayit arama onbelleginin
 * hala duruyor olmasina bagimli olmamali. Ayni yer zaten kayitliysa
 * backend mevcut kaydi donuyor - hata degil.
 */
export const savePlace = (place: Place, listId?: string | null) =>
  request<SavedPlace>("/api/saved", {
    method: "POST",
    // Tekrarlanan kayitlar backend tarafinda idempotenttir ve ad istemez.
    // Istemci yeni mi tekrar mi oldugunu bilemeyecegi icin ad varsa iletir,
    // yoksa istegi gonderir; backend yalnizca yeni kaydi reddeder.
    volunteer: true,
    body: { ...toSaveBody(place), list_id: listId ?? null },
  });

/** Sunucunun tek istekte kabul ettigi ust sinir (backend MAX_BULK_SAVE). */
export const BULK_SAVE_LIMIT = 10_000;

/**
 * Birden cok yeri tek istekte kaydeder.
 *
 * Tekli kayitla ayni kurallar: zaten kayitli olan hata degil, `ids` her
 * yer icin kayit id'sini tasiyor. Liste ve not yok - toplu kayit
 * dosyalanmamis olarak ekliyor.
 */
export const savePlaces = (places: Place[]) =>
  request<{ created: number; ids: Record<string, string> }>("/api/saved/bulk", {
    method: "POST",
    volunteer: true,
    body: { items: places.map(toSaveBody) },
  });

function toSaveBody(place: Place) {
  return {
    place_id: place.id,
    name: place.name,
    place_type: place.type,
    lat: place.coordinates.lat,
    lon: place.coordinates.lng,
    address: place.address,
    tags: place.tags ?? {},
  };
}

export const updateSavedPlace = (
  id: string,
  changes: { note?: string | null; list_id?: string | null }
) => request<SavedPlace>(`/api/saved/${id}`, { method: "PATCH", body: changes });

export const removeSavedPlace = (id: string) =>
  request<{ success: boolean }>(`/api/saved/${id}`, { method: "DELETE" });

export const addContactEvent = (id: string, body: ContactEventCreate) =>
  request<SavedPlace>(`/api/saved/${encodeURIComponent(id)}/contacts`, {
    method: "POST",
    body,
    requireVolunteer: true,
  });

export const fetchContactEvents = (id: string) =>
  request<ContactEvent[]>(`/api/saved/${encodeURIComponent(id)}/contacts`);

// --- Gecmis -----------------------------------------------------------------

export const fetchExportHistory = () =>
  request<ExportHistoryItem[]>("/api/exports");

/**
 * Kayitli bir yeri arama sonucu seklindeki `Place`e cevirir.
 *
 * CSV disa aktarimi `Place` bekliyor; kayitli yerler ise duz lat/lon
 * tutuyor. Cevrim tek yerde olmali, yoksa her cagiran kendi seklini
 * uydurur.
 */
export function savedToPlace(saved: SavedPlace): Place {
  return {
    id: saved.place_id,
    name: saved.name || "İsimsiz Yer",
    type: (saved.place_type ?? "factory") as PlaceType,
    coordinates: { lat: saved.lat, lng: saved.lon },
    address: saved.address || "Adres bilgisi yok",
    tags: saved.tags ?? {},
  };
}
