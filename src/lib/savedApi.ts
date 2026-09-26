import type { Place, PlaceType } from "./types";
import { TimeoutError, withTimeout } from "./fetchTimeout";
import { redirectToLogin } from "./api";

/**
 * Kayitli yerler, listeler ve disa aktarim gecmisi icin istemci katmani.
 *
 * Bu uclar yerel veritabanina gidiyor (Overpass beklemesi yok), bu yuzden
 * sinir arama ucundakinden cok daha kisa.
 */

const TIMEOUT_MS = 15_000;

async function request<T>(
  url: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  // Kimlik (kim kaydetti, hangi ekip) sunucuda oturumdan ekleniyor.
  const timeout = withTimeout(TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
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

  if (response.status === 401) redirectToLogin();

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
  /** Sorumlu gonullunun e-postasi; null = atanmamis. */
  assigned_to: string | null;
  assigned_name: string | null;
  /** Kimin atadigi ve ne zaman. */
  assigned_by: string | null;
  assigned_at: string | null;
  district_id: string | null;
  district_name: string | null;
  created_at: string;
}

/** Sorumlu olarak atanabilecek ekip uyesi. */
export interface Assignee {
  email: string;
  name: string;
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
    body: { ...toSaveBody(place), list_id: listId ?? null },
  });

/** Sunucunun tek istekte kabul ettigi ust sinir (backend MAX_BULK_SAVE). */
export const BULK_SAVE_LIMIT = 10_000;

/**
 * Birden cok yeri tek istekte kaydeder.
 *
 * Tekli kayitla ayni kurallar: zaten kayitli olan hata degil, `ids` her
 * yer icin kayit id'sini tasiyor. Liste verilirse yeniler oraya eklenir,
 * zaten kayitli olanlar oraya tasinir; verilmezse yeniler dosyalanmamis.
 */
export const savePlaces = (places: Place[], listId?: string | null) =>
  request<{ created: number; ids: Record<string, string> }>("/api/saved/bulk", {
    method: "POST",
    body: { items: places.map(toSaveBody), list_id: listId ?? null },
  });

/**
 * Kayitli yerleri (kayit id'leriyle) tek istekte tasir. `listId` null ise
 * dosyalanmamisa. Yalnizca bu anahtarin kayitlari etkilenir.
 */
export const moveSavedPlaces = (ids: string[], listId: string | null) =>
  request<{ moved: number }>("/api/saved/move", {
    method: "POST",
    body: { ids, list_id: listId },
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
  changes: {
    note?: string | null;
    list_id?: string | null;
    /** null: atamayi kaldir. */
    assignee?: Assignee | null;
    /** null: takibi kaldir. */
    next_follow_up_at?: string | null;
  }
) => request<SavedPlace>(`/api/saved/${id}`, { method: "PATCH", body: changes });

/**
 * Secili kayitlara toplu islem: durum (temas gecmisine yazilir), sorumlu
 * ya da takip tarihi. Gonderilmeyen alan degismez.
 */
export const bulkUpdateSaved = (
  ids: string[],
  changes: { contact_status?: ContactStatus; assignee?: Assignee | null; next_follow_up_at?: string | null }
) =>
  request<{ updated: number }>("/api/saved/bulk-update", {
    method: "POST",
    body: { ids, ...changes },
  });

// --- Ekip ve pano -------------------------------------------------------------

let membersPromise: Promise<Assignee[]> | null = null;

/** Sorumlu secimi icin ekip uyeleri (oturum boyunca bir kez cekilir). */
export function fetchMembers(): Promise<Assignee[]> {
  if (!membersPromise) {
    membersPromise = request<Assignee[]>("/api/team/members").catch((error) => {
      membersPromise = null;
      throw error;
    });
  }
  return membersPromise;
}

export interface DashboardData {
  totals: {
    saved: number;
    contacted: number;
    positive: number;
    not_suitable: number;
    overdue: number;
    due_today: number;
    unassigned: number;
  };
  by_status: Partial<Record<ContactStatus, number>>;
  by_person: { name: string; saved: number; contacts: number; positive: number; assigned: number }[];
  weekly: { week_start: string; count: number }[];
  by_list: { name: string; count: number; contacted: number }[];
}

export const fetchDashboard = () => request<DashboardData>("/api/dashboard");

/** Menudeki "Bugun" rozeti: ekibin gecikmis + bugunku takipleri. */
export const fetchDueCounts = () =>
  request<{ overdue: number; today: number; mine: number }>("/api/dashboard/due");

export const removeSavedPlace = (id: string) =>
  request<{ success: boolean }>(`/api/saved/${id}`, { method: "DELETE" });

/** Secili kayitlari (temas gecmisleriyle) tek istekte siler. */
export const bulkDeleteSaved = (ids: string[]) =>
  request<{ deleted: number }>("/api/saved/bulk-delete", { method: "POST", body: { ids } });

/**
 * Sayfa kapanirken bekleyen silmeyi yine de gonderir: keepalive istegi
 * sekme kapansa da tamamlanir. "Geri al" suresi dolmadan cikan kullanicinin
 * silmesi kaybolmasin.
 */
export function bulkDeleteSavedOnExit(ids: string[]): void {
  if (!ids.length) return;
  void fetch("/api/saved/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
    keepalive: true,
  }).catch(() => undefined);
}

export const addContactEvent = (id: string, body: ContactEventCreate) =>
  request<SavedPlace>(`/api/saved/${encodeURIComponent(id)}/contacts`, {
    method: "POST",
    body,
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
