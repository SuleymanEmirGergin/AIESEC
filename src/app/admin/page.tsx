"use client";

import { useCallback, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/adminApi";
import type { AdminReport, AdminStats } from "@/lib/types";
import AdminReportsTable from "@/components/AdminReportsTable";
import AdminReportDetail from "@/components/AdminReportDetail";
import {
  LayoutDashboard,
  Database,
  LogOut,
  Lock,
  RefreshCw,
  AlertOctagon,
  AlertCircle,
} from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState<AdminReport | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<"dashboard" | "reports">("dashboard");

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await adminApi.getStats());
    } catch (error) {
      console.error("Stats fetch error:", error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem("admin_key")) {
      setIsAdmin(true);
      fetchStats();
    }
  }, [fetchStats]);

  /**
   * Giris artik anahtari gercekten dogruluyor.
   *
   * Onceden tek kosul `adminKey.length > 4` idi: yanlis bir anahtar da
   * "giris yapmis" sayiliyor, panel aciliyor, sonra ilk istek 401 alip
   * sayfayi sessizce yeniden yukluyordu. Kullanici anahtarinin yanlis
   * oldugunu hicbir yerden ogrenemiyordu.
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = adminKey.trim();
    if (!key) return;

    setIsVerifying(true);
    setLoginError(null);

    const ok = await adminApi.verifyKey(key);

    if (!ok) {
      setIsVerifying(false);
      setLoginError("Anahtar kabul edilmedi. Lütfen kontrol edip tekrar deneyin.");
      return;
    }

    sessionStorage.setItem("admin_key", key);
    setIsAdmin(true);
    setIsVerifying(false);
    fetchStats();
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin_key");
    setIsAdmin(false);
    setStats(null);
    setAdminKey("");
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center p-4">
        <div className="w-full max-w-sm surface p-6">
          <div className="mb-6">
            <Lock size={18} aria-hidden="true" className="mb-3 text-ink-4" strokeWidth={1.75} />
            <p className="mono-label mb-1">Yönetim</p>
            <h1 className="font-display text-xl font-semibold text-ink">
              Yönetici anahtarı
            </h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-3">
            <label htmlFor="admin-key" className="block text-xs font-medium text-ink">
              Anahtar
            </label>
            <input
              id="admin-key"
              type="password"
              value={adminKey}
              onChange={(e) => {
                setAdminKey(e.target.value);
                setLoginError(null);
              }}
              autoComplete="off"
              required
              aria-invalid={!!loginError}
              aria-describedby={loginError ? "admin-key-error" : undefined}
              className={`tabular w-full rounded-input border bg-paper px-3 py-2.5 text-sm text-ink transition-colors duration-fast ease-out focus:border-accent ${
                loginError ? "border-critical" : "border-rule-2 hover:border-ink-4"
              }`}
            />

            {/* Alan bos olsa bile yer kapliyor (`field-note` min-height
                tasiyor): hata belirdiginde altindaki buton asagi kaymasin. */}
            <span id="admin-key-error" role="alert" className="field-note text-critical">
              {loginError && (
                <span className="flex items-start gap-1.5">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span>{loginError}</span>
                </span>
              )}
            </span>

            <button
              type="submit"
              disabled={isVerifying || !adminKey.trim()}
              className="btn btn--primary w-full px-4 py-2.5"
            >
              {isVerifying ? "Doğrulanıyor…" : "Giriş"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const navItem = (active: boolean) =>
    `w-full flex items-center gap-2.5 rounded-input px-3 py-2 text-xs font-medium transition-colors duration-fast ease-out ${
      active ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink"
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink-2 lg:flex-row">
      <aside className="shrink-0 border-b border-rule bg-paper lg:w-56 lg:border-b-0 lg:border-r">
        <div className="flex h-full flex-col gap-4 p-4">
          <div>
            <p className="mono-label mb-0.5">POI Finder</p>
            <span className="font-display text-sm font-semibold text-ink">Yönetim</span>
          </div>

          <nav className="flex flex-row gap-1 lg:flex-col">
            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              aria-current={activeTab === "dashboard" ? "page" : undefined}
              className={navItem(activeTab === "dashboard")}
            >
              <LayoutDashboard size={14} /> Özet
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("reports")}
              aria-current={activeTab === "reports" ? "page" : undefined}
              className={navItem(activeTab === "reports")}
            >
              <AlertOctagon size={14} /> Raporlar
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/overrides")}
              className={navItem(false)}
            >
              <Database size={14} /> Override
            </button>
          </nav>

          <button
            type="button"
            onClick={handleLogout}
            className="mt-auto hidden w-full items-center gap-2.5 rounded-input px-3 py-2 text-xs font-medium text-ink-3 transition-colors duration-fast ease-out hover:bg-paper-2 hover:text-critical lg:flex"
          >
            <LogOut size={14} /> Çıkış
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl p-4 lg:p-8">
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mono-label mb-1">
                {activeTab === "dashboard" ? "Özet" : "Bildirimler"}
              </p>
              <h2 className="font-display text-2xl font-semibold text-ink">
                {activeTab === "dashboard" ? "Sistem durumu" : "Hata raporları"}
              </h2>
            </div>

            <button
              type="button"
              onClick={fetchStats}
              disabled={statsLoading}
              className="btn btn--ghost px-3 py-2"
            >
              <RefreshCw size={13} className={statsLoading ? "animate-spin" : undefined} />
              Yenile
            </button>
          </header>

          {activeTab === "dashboard" ? (
            <div className="space-y-6">
              {/*
                Iki kutu, uc degil. Ucuncusu "SISTEM DURUMU: AKTIF" yaziyordu
                ama hicbir saglik kontrolu yapilmiyordu - sabit metindi.
                Yedi gunluk kutunun yaninda da sabit bir "+12%" artis rozeti
                duruyordu; o sayi hicbir yerden hesaplanmiyordu.
              */}
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  { label: "Son 7 gün", value: stats?.last_7_days },
                  { label: "Son 30 gün", value: stats?.last_30_days },
                ].map((tile) => (
                  <div key={tile.label} className="surface p-4">
                    <p className="mono-label mb-2">{tile.label} · rapor</p>
                    <span className="tabular font-display text-3xl font-semibold text-ink">
                      {tile.value ?? "—"}
                    </span>
                  </div>
                ))}
              </div>

              <section className="surface overflow-hidden">
                <div className="rule-b px-4 py-3">
                  <h3 className="font-display text-sm font-semibold text-ink">
                    En çok raporlanan yerler
                  </h3>
                </div>

                {stats?.top_reported_places?.length ? (
                  <ol>
                    {stats.top_reported_places.map((place, i) => (
                      <li
                        key={place.place_id}
                        className="flex items-center gap-3 rule-b px-4 py-2.5 last:border-b-0"
                      >
                        <span className="mono-label tabular w-5 shrink-0">{i + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-ink">
                            {place.name || "İsimsiz"}
                          </p>
                          <p className="tabular truncate text-2xs text-ink-4">
                            {place.place_id}
                          </p>
                        </div>
                        <span className="tabular shrink-0 text-sm font-medium text-accent">
                          {place.count}
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="px-4 py-8 text-center text-xs text-ink-4">
                    Henüz rapor yok.
                  </p>
                )}
              </section>
            </div>
          ) : (
            <AdminReportsTable
              onViewDetail={setSelectedReport}
              refreshTrigger={refreshTrigger}
            />
          )}
        </div>
      </main>

      {selectedReport && (
        <AdminReportDetail
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onUpdate={() => {
            setRefreshTrigger((prev) => prev + 1);
            fetchStats();
          }}
          onCreateOverride={(placeId, correctedType) => {
            router.push(`/admin/overrides?pre_place_id=${placeId}&pre_type=${correctedType}`);
          }}
        />
      )}
    </div>
  );
}
