import type { SavedPlace } from "../lib/savedApi";
import { followUpBucket } from "../lib/savedFilters";
import { relativeDay } from "../lib/contactTracking";

/**
 * Sabah e-postasi: herkese kendine atanmis, takibi gecmis ya da bugun
 * olan kayitlar; yoneticilere ek olarak sorumlusuz olanlar. Bos ozet
 * gonderilmiyor (her sabah "bugun bir sey yok" e-postasi gurultu).
 */

export interface DigestRecipient {
  email: string;
  name: string;
  role: "member" | "admin";
}

export interface Digest {
  to: string;
  name: string;
  mine: SavedPlace[];
  unassigned: SavedPlace[];
}

const isDue = (p: SavedPlace, today: Date) => {
  const bucket = followUpBucket(p, today);
  return bucket === "overdue" || bucket === "today";
};

const byDate = (a: SavedPlace, b: SavedPlace) =>
  a.next_follow_up_at!.localeCompare(b.next_follow_up_at!) || (a.name ?? "").localeCompare(b.name ?? "", "tr");

export function buildDigests(places: SavedPlace[], recipients: DigestRecipient[], today: Date): Digest[] {
  const due = places.filter((p) => isDue(p, today)).sort(byDate);
  const unassigned = due.filter((p) => !p.assigned_to);
  return recipients
    .map((r) => ({
      to: r.email,
      name: r.name,
      mine: due.filter((p) => p.assigned_to === r.email),
      unassigned: r.role === "admin" ? unassigned : [],
    }))
    .filter((d) => d.mine.length + d.unassigned.length > 0);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function digestEmail(d: Digest, baseUrl: string, today: Date): { subject: string; text: string; html: string } {
  const total = d.mine.length + d.unassigned.length;
  const line = (p: SavedPlace) => `${p.name || "İsimsiz yer"} (${relativeDay(p.next_follow_up_at!, today)})`;
  const sections: [string, SavedPlace[]][] = [
    ["Sana atananlar", d.mine],
    ["Sorumlusu olmayanlar", d.unassigned],
  ].filter(([, items]) => (items as SavedPlace[]).length) as [string, SavedPlace[]][];
  const link = `${baseUrl.replace(/\/+$/, "")}/bugun`;

  const text = [
    `Günaydın ${d.name},`,
    "",
    ...sections.flatMap(([title, items]) => [`${title}:`, ...items.map((p) => `- ${line(p)}`), ""]),
    `Hepsi tek ekranda: ${link}`,
  ].join("\n");

  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#192029">
  <p style="font-size:16px;font-weight:bold;margin:0 0 12px">Rota · Bugün aranacaklar</p>
  <p style="margin:0 0 16px">Günaydın ${escapeHtml(d.name)}, bugün ${total} kurum arama bekliyor.</p>
  ${sections
    .map(
      ([title, items]) => `<p style="font-size:13px;font-weight:bold;margin:16px 0 6px">${title}</p>
  <ul style="margin:0;padding-left:18px;font-size:14px;line-height:1.6">${items.map((p) => `<li>${escapeHtml(line(p))}</li>`).join("")}</ul>`
    )
    .join("\n  ")}
  <p style="margin:24px 0 0"><a href="${escapeHtml(link)}" style="background:#0064da;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">Bugün ekranını aç</a></p>
</div>`;

  return { subject: `Rota: bugün ${total} arama`, text, html };
}
