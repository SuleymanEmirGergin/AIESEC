import type { ContactStatus, SavedPlace } from "./savedApi";

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  uncontacted: "Temas edilmedi",
  preparing: "Hazırlık",
  contacted: "Temas kuruldu",
  follow_up: "Takip gerekli",
  positive: "Olumlu",
  not_suitable: "Uygun değil",
};

export function localDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDayNumber(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function getDueFollowUps(places: SavedPlace[], today: Date): SavedPlace[] {
  const todayNumber = Math.floor(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000
  );
  return places
    .filter(
      (place) =>
        place.next_follow_up_at && toDayNumber(place.next_follow_up_at) <= todayNumber + 7
    )
    .sort(
      (left, right) =>
        toDayNumber(left.next_follow_up_at!) - toDayNumber(right.next_follow_up_at!) ||
        (left.name ?? "").localeCompare(right.name ?? "", "tr")
    );
}

export function isOverdue(place: SavedPlace, today: Date): boolean {
  if (!place.next_follow_up_at) return false;
  const todayNumber = Math.floor(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000
  );
  return toDayNumber(place.next_follow_up_at) < todayNumber;
}

/** Durum rozetinin rengi: listede hangi kurumla nerede kalindigi bir bakista. */
export const CONTACT_STATUS_TONES: Record<ContactStatus, string> = {
  uncontacted: "bg-paper-3 text-ink-3",
  preparing: "bg-accent-wash text-accent",
  contacted: "bg-accent-wash text-accent",
  follow_up: "bg-caution-bg text-caution",
  positive: "bg-paper-2 text-positive",
  not_suitable: "bg-paper-2 text-critical",
};

const dayFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" });

/** "2026-09-25" -> "25 Eyl 2026". Yerel gun; UTC'ye cevirip bir gun kaydirmiyor. */
export function formatDay(value: string): string {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return dayFormat.format(new Date(year, month - 1, day));
}

/** Takip tarihi insan diliyle: "3 gün gecikti", "Bugün", "Yarın", "5 gün sonra". */
export function relativeDay(value: string, today: Date): string {
  const diff = toDayNumber(value.slice(0, 10)) - Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün (gecikti)";
  return diff < 0 ? `${-diff} gün gecikti` : `${diff} gün sonra`;
}

/** "2026-09-25" + 7 -> "2026-10-02" (takip tarihi kisayollari icin). */
export function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return localDateInputValue(new Date(year, month - 1, day + days));
}
