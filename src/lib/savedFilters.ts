import type { ContactStatus, SavedPlace } from "./savedApi";
import type { PlaceType } from "./types";
import { foldTr } from "./districts";

/**
 * Kayitlilar sayfasinin filtreleri. Tum kayitlar zaten istemcide (ekip
 * olceginde birkac bin); filtre anlik ve sunucuya gitmiyor. Sayfalama
 * yalnizca CIZIMI sinirliyor: 2.000 satirin hepsini DOM'a basmak sayfayi
 * 4 sn ve 140 MB'a cikariyordu.
 */
export interface SavedFilter {
  q: string;
  /** "__all__" | "unfiled" | liste id */
  listId: string;
  status: ContactStatus | "";
  /** "" hepsi | "me" bana atananlar | "none" atanmamis | e-posta */
  assignee: string;
  savedBy: string;
  district: string;
  followUp: "" | FollowUpBucket;
  types: PlaceType[];
}

export type FollowUpBucket = "overdue" | "today" | "week";

export const ALL_LISTS = "__all__";

export const EMPTY_FILTER: SavedFilter = {
  q: "",
  listId: ALL_LISTS,
  status: "",
  assignee: "",
  savedBy: "",
  district: "",
  followUp: "",
  types: [],
};

const CLOSED: ContactStatus[] = ["positive", "not_suitable"];
const DAY = 86_400_000;

function dayNumber(value: string | Date): number {
  const d = typeof value === "string" ? new Date(`${value.slice(0, 10)}T00:00:00`) : value;
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
}

/** Takip durumu: kapanmis (olumlu/uygun degil) kayitlarin takibi sayilmaz. */
export function followUpBucket(place: SavedPlace, today: Date): FollowUpBucket | null {
  if (!place.next_follow_up_at || CLOSED.includes(place.contact_status)) return null;
  const diff = dayNumber(place.next_follow_up_at) - dayNumber(today);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  return diff <= 7 ? "week" : null;
}

function haystack(p: SavedPlace): string {
  return foldTr(
    [p.name, p.address, p.note, p.district_name, p.saved_by, p.assigned_name, ...Object.values(p.tags ?? {})]
      .filter(Boolean)
      .join(" ")
  );
}

export function filterSaved(places: SavedPlace[], f: SavedFilter, me: string | null, today: Date): SavedPlace[] {
  const words = foldTr(f.q.trim()).split(/\s+/).filter(Boolean);
  const types = new Set<string>(f.types);
  return places.filter((p) => {
    if (f.listId === "unfiled" ? p.list_id : f.listId !== ALL_LISTS && p.list_id !== f.listId) return false;
    if (f.status && p.contact_status !== f.status) return false;
    if (f.district && p.district_id !== f.district) return false;
    if (f.savedBy && p.saved_by !== f.savedBy) return false;
    if (types.size && !(p.place_type && types.has(p.place_type))) return false;
    if (f.assignee === "me" && (!me || p.assigned_to !== me)) return false;
    if (f.assignee === "none" && p.assigned_to) return false;
    if (f.assignee && f.assignee !== "me" && f.assignee !== "none" && p.assigned_to !== f.assignee) return false;
    if (f.followUp) {
      const bucket = followUpBucket(p, today);
      // "Bu hafta" gecikmis ve bugunu de kapsar: yakinda aranacak her sey.
      if (f.followUp === "week" ? !bucket : bucket !== f.followUp) return false;
    }
    if (words.length) {
      const text = haystack(p);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
}

export function paginate<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const current = Math.min(Math.max(1, page), pages);
  return { items: items.slice((current - 1) * size, current * size), page: current, pages };
}
