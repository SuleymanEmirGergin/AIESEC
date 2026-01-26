"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { adminApi } from "@/lib/adminApi";
import type { AdminReport, AdminStats } from "@/lib/types";
import AdminReportsTable from "@/components/AdminReportsTable";
import AdminReportDetail from "@/components/AdminReportDetail";
import { 
  BarChart3, 
  Settings, 
  ShieldCheck, 
  LayoutDashboard, 
  Database, 
  LogOut, 
  Lock,
  ArrowUpRight,
  TrendingUp,
  AlertOctagon
} from "lucide-react";

export default function AdminPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [selectedReport, setSelectedReport] = useState<AdminReport | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeTab, setActiveTab] = useState<"dashboard" | "reports">("dashboard");

  useEffect(() => {
    const savedKey = sessionStorage.getItem("admin_key");
    if (savedKey) {
      setIsAdmin(true);
      fetchStats();
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminKey.length > 4) {
      sessionStorage.setItem("admin_key", adminKey);
      setIsAdmin(true);
      fetchStats();
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("admin_key");
    setIsAdmin(false);
    setStats(null);
  };

  const fetchStats = async () => {
    try {
      const data = await adminApi.getStats();
      setStats(data);
    } catch (error) {
      console.error("Stats fetch error:", error);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 border border-slate-100 dark:border-slate-700 animate-in fade-in zoom-in-95">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Lock className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-2">Yönetici Paneli</h1>
            <p className="text-slate-500 dark:text-slate-400 font-body text-sm">Lütfen yönetici anahtarınızı girerek devam edin.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Admin Anahtarı</label>
              <input 
                type="password" 
                value={adminKey}
                onChange={(e) => setAdminKey(e.target.value)}
                className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-900/50 border-2 border-transparent focus:border-primary rounded-2xl outline-none transition-all dark:text-white"
                placeholder="••••••••"
                required
              />
            </div>
            <button 
              type="submit"
              className="w-full py-4 bg-primary text-white font-bold rounded-2xl shadow-lg hover:shadow-primary/30 hover:shadow-2xl transition-all"
            >
              Giriş Yap
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex text-left transition-colors">
      {/* Sidebar */}
      <aside className="w-72 bg-white dark:bg-slate-800 border-r border-slate-100 dark:border-slate-700 hidden lg:flex flex-col">
        <div className="p-8">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shadow-lg shadow-primary/30">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-heading font-bold text-slate-900 dark:text-white">AIESEC Admin</span>
          </div>

          <nav className="space-y-2">
            <button 
              onClick={() => setActiveTab("dashboard")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                activeTab === "dashboard" ? "bg-primary text-white shadow-lg" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              }`}
            >
              <LayoutDashboard className="w-5 h-5" /> Kontrol Paneli
            </button>
            <button 
              onClick={() => setActiveTab("reports")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                activeTab === "reports" ? "bg-primary text-white shadow-lg" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              }`}
            >
              <AlertOctagon className="w-5 h-5" /> Raporlar
            </button>
            <button 
              onClick={() => router.push("/admin/overrides")}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all"
            >
              <Database className="w-5 h-5" /> Overrides
            </button>
          </nav>
        </div>

        <div className="mt-auto p-8">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
          >
            <LogOut className="w-5 h-5" /> Çıkış Yap
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-8 lg:p-12">
          {/* Header */}
          <header className="flex items-center justify-between mb-12">
            <div>
              <h2 className="text-3xl font-heading font-bold text-slate-900 dark:text-white mb-1">
                {activeTab === "dashboard" ? "Kontrol Paneli" : "Hata Raporları"}
              </h2>
              <p className="text-slate-500 font-body text-sm">Sistem durumu ve verilerini yönetin.</p>
            </div>
            
            <div className="flex items-center gap-4">
              <button 
                onClick={() => fetchStats()}
                className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 hover:shadow-md transition-all group"
              >
                <TrendingUp className="w-5 h-5 text-slate-500 group-hover:text-primary transition-colors" />
              </button>
              <div className="w-12 h-12 rounded-full border-4 border-white dark:border-slate-700 shadow-xl bg-slate-200 overflow-hidden transform hover:scale-105 transition-transform cursor-pointer">
                <div className="w-full h-full bg-primary flex items-center justify-center text-white font-bold">A</div>
              </div>
            </div>
          </header>

          {activeTab === "dashboard" ? (
            <div className="space-y-8">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <AlertOctagon className="w-24 h-24" />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Son 7 Gün Raporları</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-heading font-black dark:text-white">{stats?.last_7_days || 0}</span>
                    <span className="text-xs font-bold text-emerald-500 flex items-center">
                      <ArrowUpRight className="w-3 h-3" /> +12%
                    </span>
                  </div>
                </div>
                
                <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <BarChart3 className="w-24 h-24" />
                  </div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Son 30 Gün Raporları</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-heading font-black dark:text-white">{stats?.last_30_days || 0}</span>
                    <span className="text-xs font-bold text-slate-500">Normal</span>
                  </div>
                </div>

                <div className="bg-primary p-8 rounded-3xl shadow-2xl shadow-primary/20 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 text-white/10 group-hover:text-white/20 transition-all">
                    <ShieldCheck className="w-24 h-24" />
                  </div>
                  <p className="text-xs font-bold text-white/60 uppercase tracking-widest mb-2 text-left">Sistem Durumu</p>
                  <div className="flex items-baseline gap-2">
                    <span className="text-4xl font-heading font-black text-white">AKTİF</span>
                  </div>
                </div>
              </div>

              {/* Top Places Section */}
              <div className="bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="p-8 border-b border-slate-50 dark:border-slate-700">
                  <h3 className="text-xl font-heading font-bold dark:text-white">En Çok Raporlanan Yerler</h3>
                </div>
                <div className="p-8">
                  <div className="space-y-4">
                    {stats?.top_reported_places.map((place, i) => (
                      <div key={place.place_id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl group hover:bg-slate-100 transition-colors">
                        <div className="flex items-center gap-4">
                          <span className="w-8 h-8 rounded-lg bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center font-bold text-slate-400">
                            {i + 1}
                          </span>
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{place.name}</p>
                            <p className="text-xs text-slate-500 font-mono">{place.place_id}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end">
                          <span className="text-lg font-black text-primary">{place.count}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase">HATA BİLDİRİMİ</span>
                        </div>
                      </div>
                    ))}
                    {(!stats?.top_reported_places || stats.top_reported_places.length === 0) && (
                      <p className="text-center py-8 text-slate-500 italic">Henüz veri toplanmadı.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <AdminReportsTable 
              onViewDetail={setSelectedReport} 
              refreshTrigger={refreshTrigger} 
            />
          )}
        </div>
      </main>

      {/* Detail Overlay */}
      {selectedReport && (
        <AdminReportDetail 
          report={selectedReport} 
          onClose={() => setSelectedReport(null)}
          onUpdate={() => {
            setRefreshTrigger(prev => prev + 1);
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
