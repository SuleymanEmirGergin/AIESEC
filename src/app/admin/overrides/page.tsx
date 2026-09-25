"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminApi";
import type { AdminOverride } from "@/lib/types";
import OverridesTable from "@/components/OverridesTable";
import OverrideForm from "@/components/OverrideForm";
import { ArrowLeft, Plus, Info } from "lucide-react";

function OverridesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedOverride, setSelectedOverride] = useState<AdminOverride | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Pre-fill from query params (e.g. from report detail)
  const prePlaceId = searchParams.get("pre_place_id");
  const preType = searchParams.get("pre_type");

  useEffect(() => {
    if (prePlaceId) setIsFormOpen(true);
  }, [prePlaceId]);

  const handleSave = async (data: Partial<AdminOverride>) => {
    if (selectedOverride) {
      await adminApi.upsertOverride({ ...selectedOverride, ...data });
    } else {
      await adminApi.upsertOverride(data);
    }
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-paper text-ink-2">
      <div className="mx-auto max-w-5xl p-4 lg:p-8">
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-ink-3 transition-colors duration-fast ease-out hover:text-ink"
        >
          <ArrowLeft size={13} /> Yönetim
        </button>

        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mono-label mb-1">Sınıflandırma</p>
            <h1 className="font-display text-2xl font-semibold text-ink">
              Veri override&apos;ları
            </h1>
          </div>

          <button
            type="button"
            onClick={() => {
              setSelectedOverride(null);
              setIsFormOpen(true);
            }}
            className="btn btn--primary px-4 py-2.5"
          >
            <Plus size={14} /> Yeni override
          </button>
        </header>

        {/* Bilgi seridi: hairline + durum rengi. Onceden buyuk yuvarlak
            bir amber kart bloguydu ve sayfanin ana ogesi gibi
            gorunuyordu; oysa asil icerik asagidaki tablo. */}
        <p className="mb-6 flex items-start gap-2.5 rounded-input border border-rule bg-paper-2 px-3 py-2.5 text-xs leading-relaxed text-ink-3">
          <Info size={14} className="mt-px shrink-0 text-caution" />
          <span>
            Buraya eklenen bir Place ID, OSM&apos;deki kategorisi ne olursa olsun
            arama sonuçlarında her zaman seçilen tür olarak görünür.
          </span>
        </p>

        <OverridesTable
          onEdit={(ov: AdminOverride) => {
            setSelectedOverride(ov);
            setIsFormOpen(true);
          }}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {isFormOpen && (
        <OverrideForm
          override={selectedOverride}
          onClose={() => {
            setIsFormOpen(false);
            setSelectedOverride(null);
          }}
          onSave={handleSave}
          preFill={prePlaceId ? { placeId: prePlaceId, type: preType || undefined } : undefined}
        />
      )}
    </div>
  );
}

export default function OverridesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper">
          <span className="mono-label">Yükleniyor</span>
        </div>
      }
    >
      <OverridesPageContent />
    </Suspense>
  );
}
