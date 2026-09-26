"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarPlus, ExternalLink, PhoneCall } from "lucide-react";
import AppHeader from "../../components/AppHeader";
import QuickActions from "../../components/QuickActions";
import { ContactForm, StatusBadge } from "../../components/ContactPanel";
import { fetchAccount } from "../../lib/api";
import {
  addContactEvent,
  fetchSavedPlaces,
  updateSavedPlace,
  type ContactEventCreate,
  type SavedPlace,
} from "../../lib/savedApi";
import { followUpBucket, type FollowUpBucket } from "../../lib/savedFilters";
import { addDays, localDateInputValue, relativeDay } from "../../lib/contactTracking";

const SECTIONS: { bucket: FollowUpBucket; title: string; empty: string }[] = [
  { bucket: "overdue", title: "Gecikenler", empty: "Geciken takip yok." },
  { bucket: "today", title: "Bugün", empty: "Bugün için takip yok." },
  { bucket: "week", title: "Önümüzdeki 7 gün", empty: "Bu hafta planlanmış takip yok." },
];

/**
 * Gunun is listesi: takip tarihi gelmis ya da yaklasan kayitlar, tek
 * ekranda. Gonullu buradan arar, sonucu yazar, gerekirse erteler; kayit
 * listeden kendiliginden duser (takip tarihi ileri gider ya da kapanir).
 */
export default function BugunPage() {
  const [places, setPlaces] = useState<SavedPlace[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    fetchSavedPlaces()
      .then(setPlaces)
      .catch((err) => setError(err?.message || "Kayıtlar yüklenemedi."));
    fetchAccount().then((a) => setMe(a?.email ?? null));
  }, []);

  const patch = useCallback((updated: SavedPlace) => {
    window.dispatchEvent(new Event("rota:due"));
    // PATCH/temas cevabi ilce alanlarini tasimiyor; yereldekini koru.
    setPlaces((prev) =>
      prev?.map((p) =>
        p.id === updated.id ? { ...p, ...updated, district_id: p.district_id, district_name: p.district_name } : p
      ) ?? prev
    );
  }, []);

  const groups = useMemo(() => {
    const result: Record<FollowUpBucket, SavedPlace[]> = { overdue: [], today: [], week: [] };
    for (const p of places ?? []) {
      if (onlyMine && p.assigned_to !== me) continue;
      const bucket = followUpBucket(p, today);
      if (bucket) result[bucket].push(p);
    }
    for (const list of Object.values(result)) {
      list.sort((a, b) => a.next_follow_up_at!.localeCompare(b.next_follow_up_at!) || (a.name ?? "").localeCompare(b.name ?? "", "tr"));
    }
    return result;
  }, [places, onlyMine, me, today]);

  const postpone = async (place: SavedPlace, days: number) => {
    try {
      patch(await updateSavedPlace(place.id, { next_follow_up_at: addDays(localDateInputValue(today), days) }));
    } catch (err: any) {
      setError(err?.message || "Takip ertelenemedi.");
    }
  };

  const saveContact = async (place: SavedPlace, data: ContactEventCreate) => {
    patch(await addContactEvent(place.id, data));
    setOpenForm(null);
  };

  const total = groups.overdue.length + groups.today.length;

  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink-2">
      <AppHeader />
      <div className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-4 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink">Bugün aranacaklar</h1>
            <p className="mt-1 text-xs text-ink-3">
              {places === null ? "Yükleniyor…" : total ? `${total} kurum bugün arama bekliyor.` : "Bugün için bekleyen arama yok."}
            </p>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-2">
            <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="accent-[var(--color-accent)]" />
            Sadece bana atananlar
          </label>
        </div>

        {error && (
          <p className="flex items-start gap-2 rounded-card bg-caution-bg px-3 py-2 text-xs text-caution">
            <AlertCircle size={13} className="mt-px shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        {places !== null &&
          SECTIONS.map(({ bucket, title, empty }) => (
            <section key={bucket} aria-labelledby={`h-${bucket}`}>
              <h2 id={`h-${bucket}`} className="mono-label mb-2 flex items-center gap-2">
                {title}
                <span className={`tabular ${bucket === "overdue" && groups[bucket].length ? "text-critical" : "text-ink-4"}`}>
                  {groups[bucket].length}
                </span>
              </h2>
              {groups[bucket].length === 0 ? (
                <p className="rounded-card border border-dashed border-rule px-3 py-4 text-center text-xs text-ink-4">{empty}</p>
              ) : (
                <ul className="space-y-2">
                  {groups[bucket].map((p) => (
                    <li key={p.id} className="rounded-card border border-rule bg-paper p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">{p.name || "İsimsiz yer"}</p>
                          <p className="mt-0.5 text-2xs text-ink-4">
                            {[p.district_name, p.assigned_name ? `Sorumlu: ${p.assigned_name}` : "Atanmamış"].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={p.contact_status} />
                          <span className={`text-2xs font-medium ${bucket === "overdue" ? "text-critical" : "text-ink-3"}`}>
                            {relativeDay(p.next_follow_up_at!, today)}
                          </span>
                        </div>
                      </div>
                      {p.note && <p className="mt-2 line-clamp-2 text-xs text-ink-3">{p.note}</p>}
                      <QuickActions tags={p.tags} className="mt-3" />
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => setOpenForm(openForm === p.id ? null : p.id)} className="btn btn--primary px-2.5 py-1.5 text-xs">
                          <PhoneCall size={13} aria-hidden="true" />
                          Sonucu yaz
                        </button>
                        <button type="button" onClick={() => postpone(p, 1)} className="btn btn--ghost px-2.5 py-1.5 text-xs">
                          <CalendarPlus size={13} aria-hidden="true" />
                          Yarına ertele
                        </button>
                        <button type="button" onClick={() => postpone(p, 7)} className="btn btn--ghost px-2.5 py-1.5 text-xs">
                          1 hafta ertele
                        </button>
                        <Link href={`/kayitli?ara=${encodeURIComponent(p.name ?? "")}`} className="btn btn--ghost ml-auto px-2.5 py-1.5 text-xs">
                          <ExternalLink size={13} aria-hidden="true" />
                          Kayıtta aç
                        </Link>
                      </div>
                      {openForm === p.id && (
                        <ContactForm initialStatus={p.contact_status} onSubmit={(data) => saveContact(p, data)} onCancel={() => setOpenForm(null)} />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
      </div>
    </main>
  );
}
