"use client";

import { useCallback, useState, useEffect } from "react";
import { adminApi } from "@/lib/adminApi";
import type { AdminReport, ReportStatus } from "@/lib/types";
import { PLACE_TYPE_LABELS } from "@/lib/labels";
import { ArrowRight } from "lucide-react";

interface AdminReportsTableProps {
  onViewDetail: (report: AdminReport) => void;
  refreshTrigger: number;
}

const PAGE_SIZE = 10;

const STATUS_LABELS: Record<ReportStatus, string> = {
  open: "Açık",
  resolved: "Çözüldü",
  ignored: "Yoksayıldı",
};

/**
 * Durum rozetleri sistemin durum renklerini kullaniyor. Onceden her durum
 * icin ayri bir Tailwind rampasi (amber/emerald/slate) ve ayri bir koyu
 * mod varyanti vardi; koyu mod hicbir zaman devreye girmiyordu.
 */
const STATUS_STYLES: Record<ReportStatus, string> = {
  open: "text-caution",
  resolved: "text-positive",
  ignored: "text-ink-4",
};

export default function AdminReportsTable({
  onViewDetail,
  refreshTrigger,
}: AdminReportsTableProps) {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | "all">("all");

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    try {
      // Backend `offset` bekliyor. Onceden buradan `page` gonderiliyordu;
      // uc bu parametreyi taniyip yok sayiyordu, dolayisiyla "Sonraki"
      // her zaman ayni ilk on kaydi getiriyordu.
      const res = await adminApi.getReports({
        status: statusFilter,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setReports(res.data);
      setTotal(res.total);
    } catch (error) {
      console.error("Failed to fetch reports:", error);
    } finally {
      setIsLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports, refreshTrigger]);

  // Filtre degisince ilk sayfaya don; yoksa uc sayfadayken filtreleyip
  // bos bir sayfada kaliniyor.
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="surface overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 rule-b px-4 py-3">
        <label htmlFor="report-status" className="mono-label">
          Durum
        </label>
        <select
          id="report-status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ReportStatus | "all")}
          className="rounded-input border border-rule-2 bg-paper px-2.5 py-1.5 text-xs text-ink transition-colors duration-fast ease-out hover:border-ink-4 focus:border-accent"
        >
          <option value="all">Tümü</option>
          <option value="open">Açık</option>
          <option value="resolved">Çözüldü</option>
          <option value="ignored">Yoksayıldı</option>
        </select>

        <span className="mono-label tabular ml-auto">
          {rangeStart}–{rangeEnd} / {total}
        </span>
      </div>

      {/* overflow-x-auto: genis tablo kendi kabinde kayar, sayfa govdesi
          yatayda asla kaymaz. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-left">
          <thead>
            <tr className="rule-b">
              <th scope="col" className="px-4 py-2.5 mono-label font-normal">Tarih</th>
              <th scope="col" className="px-4 py-2.5 mono-label font-normal">Yer</th>
              <th scope="col" className="px-4 py-2.5 mono-label font-normal">Düzeltme</th>
              <th scope="col" className="px-4 py-2.5 mono-label font-normal">Durum</th>
              <th scope="col" className="px-4 py-2.5 mono-label font-normal">
                <span className="sr-only">İşlem</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center">
                  <span className="mono-label">Yükleniyor</span>
                </td>
              </tr>
            ) : reports.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-xs text-ink-4">
                  Bu filtreyle rapor yok.
                </td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr
                  key={report.id}
                  className="rule-b last:border-b-0 transition-colors duration-fast ease-out hover:bg-paper-2"
                >
                  <td className="px-4 py-3 align-top">
                    <span className="tabular block text-xs text-ink">
                      {new Date(report.created_at).toLocaleDateString("tr-TR")}
                    </span>
                    <span className="tabular block text-2xs text-ink-4">
                      {new Date(report.created_at).toLocaleTimeString("tr-TR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <span className="block max-w-[16rem] truncate text-xs text-ink">
                      {report.placeName || "İsimsiz"}
                    </span>
                    <span className="tabular block max-w-[16rem] truncate text-2xs text-ink-4">
                      {report.placeId}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <span className="inline-flex items-center gap-1.5 text-2xs">
                      <span className="text-ink-3">
                        {PLACE_TYPE_LABELS[report.currentType] ?? report.currentType}
                      </span>
                      <ArrowRight size={11} className="text-ink-4" />
                      <span className="text-accent">
                        {PLACE_TYPE_LABELS[report.correctedType] ?? report.correctedType}
                      </span>
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <span className={`mono-label ${STATUS_STYLES[report.status]}`}>
                      {STATUS_LABELS[report.status] ?? report.status}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top text-right">
                    <button
                      type="button"
                      onClick={() => onViewDetail(report)}
                      className="text-xs font-medium text-accent underline decoration-accent-edge underline-offset-4 transition-colors duration-fast ease-out hover:decoration-accent"
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

      <div className="flex items-center justify-between gap-3 rule-t bg-paper-2 px-4 py-2.5">
        <span className="mono-label tabular">
          Sayfa {page} / {lastPage}
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="btn btn--ghost px-2.5 py-1.5 text-2xs"
          >
            Önceki
          </button>
          <button
            type="button"
            disabled={page >= lastPage}
            onClick={() => setPage((p) => p + 1)}
            className="btn btn--ghost px-2.5 py-1.5 text-2xs"
          >
            Sonraki
          </button>
        </div>
      </div>
    </div>
  );
}
