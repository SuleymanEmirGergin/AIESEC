"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import { adminApi } from "@/lib/adminApi";
import type { AdminOverride } from "@/lib/types";
import { PLACE_TYPE_LABELS } from "@/lib/labels";
import { Pencil, Trash2, Search, AlertCircle } from "lucide-react";

interface OverridesTableProps {
  onEdit: (override: AdminOverride) => void;
  refreshTrigger: number;
}

export default function OverridesTable({ onEdit, refreshTrigger }: OverridesTableProps) {
  const [overrides, setOverrides] = useState<AdminOverride[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Silme iki adimli: once butona basilir, sonra onaylanir. */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const fetchOverrides = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Backend'de arama filtresi yok; `search` parametresi gonderiliyor
      // ama yok sayiliyordu. Uc zaten tum kayitlari tek seferde donuyor,
      // dolayisiyla filtreleme istemci tarafinda yapiliyor - boylece
      // kutunun yazdigi sey ile yaptigi sey ayni.
      setOverrides(await adminApi.getOverrides({ limit: 100 }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Override'lar yüklenemedi.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides, refreshTrigger]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr");
    if (!q) return overrides;
    return overrides.filter(
      (ov) =>
        ov.place_id.toLocaleLowerCase("tr").includes(q) ||
        (ov.notes ?? "").toLocaleLowerCase("tr").includes(q)
    );
  }, [overrides, search]);

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await adminApi.deleteOverride(id);
      setPendingDelete(null);
      fetchOverrides();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Silinemedi.");
    }
  };

  return (
    <div className="surface overflow-hidden">
      <div className="rule-b px-4 py-3">
        <div className="relative max-w-sm">
          <Search
            size={13}
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4"
          />
          <label htmlFor="override-search" className="sr-only">
            Place ID veya notlarda ara
          </label>
          <input
            id="override-search"
            type="search"
            placeholder="Place ID veya not ara"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-input border border-rule-2 bg-paper py-1.5 pl-8 pr-3 text-xs text-ink placeholder:text-ink-4 transition-colors duration-fast ease-out hover:border-ink-4 focus:border-accent"
          />
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rule-b px-4 py-2.5 text-xs text-critical"
        >
          <AlertCircle size={13} className="mt-px shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[38rem] border-collapse text-left">
          <thead>
            <tr className="rule-b">
              <th scope="col" className="px-4 py-2.5 mono-label font-normal">Place ID</th>
              <th scope="col" className="px-4 py-2.5 mono-label font-normal">Zorunlu tür</th>
              <th scope="col" className="px-4 py-2.5 mono-label font-normal">Durum</th>
              <th scope="col" className="px-4 py-2.5 mono-label font-normal">Tarih</th>
              <th scope="col" className="px-4 py-2.5 mono-label font-normal text-right">
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
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-xs text-ink-4">
                  {search ? "Bu aramayla eşleşen kayıt yok." : "Kayıtlı override yok."}
                </td>
              </tr>
            ) : (
              filtered.map((ov) => (
                <tr
                  key={ov.id}
                  className="rule-b last:border-b-0 transition-colors duration-fast ease-out hover:bg-paper-2"
                >
                  <td className="px-4 py-3 align-top">
                    <span className="tabular block max-w-[14rem] truncate text-xs text-accent">
                      {ov.place_id}
                    </span>
                    {ov.notes && (
                      <span className="block max-w-[14rem] truncate text-2xs text-ink-4">
                        {ov.notes}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <span className="block text-xs text-ink">
                      {PLACE_TYPE_LABELS[ov.forced_type] ?? ov.forced_type}
                    </span>
                    {ov.forced_subtype && (
                      <span className="block text-2xs text-ink-4">{ov.forced_subtype}</span>
                    )}
                  </td>

                  <td className="px-4 py-3 align-top">
                    <span
                      className={`mono-label ${ov.is_active ? "text-positive" : "text-ink-4"}`}
                    >
                      {ov.is_active ? "Aktif" : "Pasif"}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <span className="tabular text-2xs text-ink-3">
                      {new Date(ov.created_at).toLocaleDateString("tr-TR")}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center justify-end gap-1">
                      {/*
                        Iki adimli silme. Onceden native confirm() acilıyordu;
                        tarayici diyalogu sayfanin disinda duruyor, hangi
                        kaydin silinecegini gostermiyor ve stil alamiyor.
                      */}
                      {pendingDelete === ov.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleDelete(ov.id)}
                            className="rounded-input px-2 py-1 text-2xs font-medium text-critical hover:bg-paper-3 transition-colors duration-fast ease-out"
                          >
                            Sil, onayla
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(null)}
                            className="rounded-input px-2 py-1 text-2xs font-medium text-ink-3 hover:bg-paper-3 transition-colors duration-fast ease-out"
                          >
                            Vazgeç
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => onEdit(ov)}
                            aria-label={`${ov.place_id} override'ını düzenle`}
                            className="rounded-input p-1.5 text-ink-4 hover:bg-paper-3 hover:text-accent transition-colors duration-fast ease-out"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(ov.id)}
                            aria-label={`${ov.place_id} override'ını sil`}
                            className="rounded-input p-1.5 text-ink-4 hover:bg-paper-3 hover:text-critical transition-colors duration-fast ease-out"
                          >
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
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
