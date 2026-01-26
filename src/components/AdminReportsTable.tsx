"use client";

import { useState, useEffect } from "react";
import { adminApi } from "@/lib/adminApi";
import type { AdminReport, ReportStatus } from "@/lib/types";
import { PLACE_TYPE_LABELS } from "@/lib/labels";
import { Calendar, ChevronRight, Clock, Filter, Search, Tag, User } from "lucide-react";

interface AdminReportsTableProps {
  onViewDetail: (report: AdminReport) => void;
  refreshTrigger: number;
}

export default function AdminReportsTable({ onViewDetail, refreshTrigger }: AdminReportsTableProps) {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("all");
  const [search, setSearch] = useState("");

  const fetchReports = async () => {
    setIsLoading(true);
    try {
      const params: any = { page, limit: 10 };
      if (statusFilter !== "all") params.status = statusFilter;
      if (search) params.search = search;
      
      const res = await adminApi.getReports(params);
      setReports(res.data);
      setTotal(res.total);
    } catch (error) {
      console.error("Failed to fetch reports:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [page, statusFilter, search, refreshTrigger]);

  const getStatusColor = (status: ReportStatus) => {
    switch (status) {
      case "open": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      case "resolved": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "ignored": return "bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400";
      default: return "bg-slate-100 text-slate-700";
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-slate-700">
      <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-[300px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Rapor ara (Yer adı veya ID)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 rounded-lg text-sm outline-none border border-transparent focus:border-primary transition-all"
            />
          </div>
          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-slate-50 dark:bg-slate-900 text-sm font-bold px-4 py-2 rounded-lg outline-none border border-transparent focus:border-primary"
          >
            <option value="all">Tüm Durumlar</option>
            <option value="open">Açık</option>
            <option value="resolved">Çözüldü</option>
            <option value="ignored">Yoksayıldı</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-700">
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tarih</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Yer</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gösterilen / Doğru</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Durum</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Aksiyon</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td colSpan={5} className="px-6 py-4 h-16 bg-slate-50/20 dark:bg-slate-800/20"></td>
                </tr>
              ))
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500 font-body">Rapor bulunamadı.</td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {new Date(report.created_at).toLocaleDateString("tr-TR")}
                      </span>
                      <span className="text-[10px] text-slate-500">{new Date(report.created_at).toLocaleTimeString("tr-TR")}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col min-w-[200px]">
                      <span className="text-sm font-bold text-slate-900 dark:text-white truncate">{report.placeName}</span>
                      <span className="text-[10px] text-primary font-mono">{report.placeId}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                        {PLACE_TYPE_LABELS[report.currentType]}
                      </span>
                      <ChevronRight className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-primary/10 text-primary">
                        {PLACE_TYPE_LABELS[report.correctedType]}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full ${getStatusColor(report.status)} uppercase`}>
                      {report.status === "open" ? "Açık" : report.status === "resolved" ? "Çözüldü" : "Gizlendi"}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => onViewDetail(report)}
                      className="text-primary hover:text-primary-600 font-bold text-sm underline underline-offset-4 decoration-primary/30"
                    >
                      Detay
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between">
        <span className="text-xs text-slate-500 font-bold">Toplam {total} kayıt</span>
        <div className="flex gap-2">
          <button 
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
            className="px-3 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50"
          >
            Önceki
          </button>
          <button 
            disabled={page * 10 >= total}
            onClick={() => setPage(page + 1)}
            className="px-3 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-50"
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  );
}
