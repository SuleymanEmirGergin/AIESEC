import type { ContactStatus, SavedPlace } from "./savedApi";

export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  uncontacted: "Temas edilmedi",
  preparing: "Hazırlık",
  contacted: "Temas kuruldu",
  follow_up: "Takip gerekli",
  positive: "Olumlu",
  not_suitable: "Uygun değil",
};

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
