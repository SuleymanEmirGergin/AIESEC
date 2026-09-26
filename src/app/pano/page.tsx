"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import AppHeader from "../../components/AppHeader";
import { fetchDashboard, type ContactStatus, type DashboardData } from "../../lib/savedApi";
import { CONTACT_STATUS_LABELS, formatDay } from "../../lib/contactTracking";

const STATUS_BAR: Record<ContactStatus, string> = {
  uncontacted: "bg-rule-2",
  preparing: "bg-ink-4",
  contacted: "bg-accent",
  follow_up: "bg-caution",
  positive: "bg-positive",
  not_suitable: "bg-critical",
};

function Stat({ label, value, href, tone = "text-ink" }: { label: string; value: number; href?: string; tone?: string }) {
  const body = (
    <>
      <span className={`tabular block font-display text-2xl font-semibold ${tone}`}>{value.toLocaleString("tr-TR")}</span>
      <span className="mono-label mt-1 block">{label}</span>
    </>
  );
  const cls = "block rounded-card border border-rule bg-paper p-3";
  return href ? (
    <Link href={href} className={`${cls} hover:border-accent`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-rule bg-paper p-4">
      <h2 className="mono-label mb-3">{title}</h2>
      {children}
    </section>
  );
}

/** Ekibin durumu tek bakista: kac kurum, ne kadari arandi, kim ne yapti. */
export default function PanoPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard()
      .then(setData)
      .catch((err) => setError(err?.message || "Pano yüklenemedi."));
  }, []);

  const t = data?.totals;
  const weekMax = Math.max(1, ...(data?.weekly.map((w) => w.count) ?? []));

  return (
    <main className="flex min-h-screen flex-col bg-paper-2 text-ink-2">
      <AppHeader />
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-4 py-6">
        <h1 className="font-display text-xl font-semibold text-ink">Pano</h1>

        {error && (
          <p className="flex items-start gap-2 rounded-card bg-caution-bg px-3 py-2 text-xs text-caution">
            <AlertCircle size={13} className="mt-px shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}
        {!data && !error && <p className="text-xs text-ink-3">Yükleniyor…</p>}

        {data && t && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <Stat label="Kayıtlı kurum" value={t.saved} href="/kayitli" />
              <Stat label="Temas edilen" value={t.contacted} />
              <Stat label="Olumlu" value={t.positive} tone="text-positive" />
              <Stat label="Uygun değil" value={t.not_suitable} />
              <Stat label="Geciken takip" value={t.overdue} tone={t.overdue ? "text-critical" : "text-ink"} href="/bugun" />
              <Stat label="Bugün aranacak" value={t.due_today} href="/bugun" />
              <Stat label="Sorumlusuz" value={t.unassigned} href="/kayitli?sorumlu=yok" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Durum dağılımı">
                <div className="flex h-3 overflow-hidden rounded-full bg-paper-2" role="img" aria-label="Durum dağılımı çubuğu">
                  {(Object.keys(CONTACT_STATUS_LABELS) as ContactStatus[]).map((s) => {
                    const n = data.by_status[s] ?? 0;
                    return n ? <span key={s} className={STATUS_BAR[s]} style={{ width: `${(n / Math.max(1, t.saved)) * 100}%` }} /> : null;
                  })}
                </div>
                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {(Object.keys(CONTACT_STATUS_LABELS) as ContactStatus[]).map((s) => (
                    <li key={s} className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_BAR[s]}`} aria-hidden="true" />
                      <span className="text-ink-2">{CONTACT_STATUS_LABELS[s]}</span>
                      <span className="tabular ml-auto text-ink-3">{(data.by_status[s] ?? 0).toLocaleString("tr-TR")}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title="Haftalık temas (son 8 hafta)">
                <div className="flex h-36 gap-2">
                  {data.weekly.map((w) => (
                    <div key={w.week_start} className="flex h-full flex-1 flex-col items-center gap-1">
                      <span className="tabular text-2xs text-ink-3">{w.count}</span>
                      <div className="flex w-full flex-1 items-end">
                        <span className="w-full rounded-t bg-accent" style={{ height: `${(w.count / weekMax) * 100}%`, minHeight: w.count ? 4 : 1 }} />
                      </div>
                      <span className="text-2xs text-ink-4">{formatDay(w.week_start).split(" ").slice(0, 2).join(" ")}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="Kişi bazında">
                {data.by_person.length === 0 ? (
                  <p className="text-xs text-ink-4">Henüz kayıt yok.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="text-left text-ink-4">
                        <tr>
                          <th className="py-1 font-medium">Kişi</th>
                          <th className="py-1 text-right font-medium">Kaydetti</th>
                          <th className="py-1 text-right font-medium">Temas</th>
                          <th className="py-1 text-right font-medium">Olumlu</th>
                          <th className="py-1 text-right font-medium">Sorumlu</th>
                        </tr>
                      </thead>
                      <tbody className="tabular">
                        {data.by_person.map((p) => (
                          <tr key={p.name} className="border-t border-rule">
                            <td className="py-1.5 text-ink">{p.name}</td>
                            <td className="py-1.5 text-right">{p.saved}</td>
                            <td className="py-1.5 text-right">{p.contacts}</td>
                            <td className="py-1.5 text-right text-positive">{p.positive}</td>
                            <td className="py-1.5 text-right">{p.assigned}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>

              <Card title="Listeler">
                {data.by_list.length === 0 ? (
                  <p className="text-xs text-ink-4">Henüz liste yok.</p>
                ) : (
                  <ul className="space-y-2 text-xs">
                    {data.by_list.map((l) => (
                      <li key={l.name}>
                        <div className="flex justify-between">
                          <span className="truncate text-ink">{l.name}</span>
                          <span className="tabular text-ink-3">
                            {l.contacted}/{l.count} arandı
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-2">
                          <span className="block h-full bg-accent" style={{ width: `${(l.contacted / Math.max(1, l.count)) * 100}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
