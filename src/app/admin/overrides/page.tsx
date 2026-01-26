"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminApi } from "@/lib/adminApi";
import type { AdminOverride } from "@/lib/types";
import OverridesTable from "@/components/OverridesTable";
import OverrideForm from "@/components/OverrideForm";
import { 
  ArrowLeft, 
  Plus, 
  Database, 
  Info,
  ShieldAlert
} from "lucide-react";
import { Suspense } from "react";

function OverridesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedOverride, setSelectedOverride] = useState<AdminOverride | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Pre-fill from query params (e.g. from report detail)
  const prePlaceId = searchParams.get("pre_place_id");
  const preType = searchParams.get("pre_type");

  useEffect(() => {
    const savedKey = sessionStorage.getItem("admin_key");
    if (!savedKey) {
      router.push("/admin");
    } else {
      setIsAdmin(true);
      if (prePlaceId) {
        setIsFormOpen(true);
      }
    }
  }, [prePlaceId]);

  const handleSave = async (data: Partial<AdminOverride>) => {
    try {
      if (selectedOverride) {
        // Edit
        await adminApi.upsertOverride({ ...selectedOverride, ...data });
      } else {
        // Create
        await adminApi.upsertOverride(data);
      }
      setRefreshTrigger(prev => prev + 1);
    } catch (error) {
      throw error;
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-left transition-colors font-body">
      <div className="max-w-6xl mx-auto p-8 lg:p-12">
        {/* Navigation */}
        <button 
          onClick={() => router.push("/admin")}
          className="flex items-center gap-2 text-slate-500 hover:text-primary transition-colors mb-8 font-bold text-sm bg-white dark:bg-slate-800 px-4 py-2 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700"
        >
          <ArrowLeft className="w-4 h-4" /> Geri Dön
        </button>

        {/* Header */}
        <header className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
              <Database className="w-8 h-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-heading font-bold text-slate-900 dark:text-white">Veri Overrides</h1>
              <p className="text-slate-500 text-sm">OSM verilerini manuel olarak geçersiz kılın.</p>
            </div>
          </div>
          
          <button 
            onClick={() => {
              setSelectedOverride(null);
              setIsFormOpen(true);
            }}
            className="flex items-center gap-2 px-6 py-4 bg-primary text-white font-bold rounded-2xl shadow-lg hover:shadow-primary/30 hover:scale-105 transition-all"
          >
            <Plus className="w-5 h-5" /> Yeni Override
          </button>
        </header>

        {/* Info Banner */}
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 p-6 rounded-3xl mb-12 flex items-start gap-4">
          <Info className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold text-amber-800 dark:text-amber-300 text-sm">Bilgi</h4>
            <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1 leading-relaxed">
              Overrides sistemi, arama sonuçlarını doğrudan etkiler. Buraya eklenen bir Place ID, OSM'deki orijinal kategorisi ne olursa olsun her zaman seçilen "Zorunlu Tip" olarak görünecektir.
            </p>
          </div>
        </div>

        {/* Table Area */}
        <OverridesTable 
          onEdit={(ov: AdminOverride) => {
            setSelectedOverride(ov);
            setIsFormOpen(true);
          }}
          refreshTrigger={refreshTrigger}
        />
      </div>

      {/* Form Modal */}
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
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center">Yükleniyor...</div>}>
      <OverridesPageContent />
    </Suspense>
  );
}
