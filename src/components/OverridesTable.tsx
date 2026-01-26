"use client";

import { useState, useEffect } from "react";
import { adminApi } from "@/lib/adminApi";
import type { AdminOverride } from "@/lib/types";
import { PLACE_TYPE_LABELS } from "@/lib/labels";
import { Edit2, Trash2, Power, Search, History, Database } from "lucide-react";

interface OverridesTableProps {
  onEdit: (override: AdminOverride) => void;
  refreshTrigger: number;
}

export default function OverridesTable({ onEdit, refreshTrigger }: OverridesTableProps) {
  const [overrides, setOverrides] = useState<AdminOverride[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchOverrides = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getOverrides({ search });
      setOverrides(res);
    } catch (error) {
      console.error("Fetch overrides failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOverrides();
  }, [search, refreshTrigger]);

  const handleDelete = async (id: string) => {
    if (confirm("Bu override'ı silmek istediğinize emin misiniz?")) {
      try {
        await adminApi.deleteOverride(id);
        fetchOverrides();
      } catch (error) {
        alert("Silme hatası: " + (error instanceof Error ? error.message : "Bilinmeyen hata"));
      }
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-100 dark:border-slate-700">
      <div className="p-6 border-b border-slate-100 dark:border-slate-700">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Place ID veya notlarda ara..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm outline-none border border-transparent focus:border-primary transition-all dark:text-white"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Place ID</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Uygulanan Tip</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Durum</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tarih</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {isLoading ? (
              [...Array(3)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={5} className="px-6 py-4 h-16"></td>
                </tr>
              ))
            ) : overrides.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-body italic">Kayıtlı override bulunamadı.</td>
              </tr>
            ) : (
              overrides.map((ov) => (
                <tr key={ov.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-sm font-mono font-bold text-primary">{ov.place_id}</span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {PLACE_TYPE_LABELS[ov.forced_type]}
                      </span>
                      {ov.forced_subtype && (
                        <span className="text-[10px] text-slate-500 italic">{ov.forced_subtype}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase ${
                      ov.is_active 
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" 
                        : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                    }`}>
                      <Power className="w-3 h-3" />
                      {ov.is_active ? "Aktif" : "Pasif"}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-slate-500 font-bold">
                      {new Date(ov.created_at).toLocaleDateString("tr-TR")}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => onEdit(ov)}
                        className="p-2 text-slate-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                        title="Düzenle"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(ov.id)}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-all"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
