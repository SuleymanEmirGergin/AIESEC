"use client";

import { useState, useEffect } from "react";
import { PLACE_TYPE_LABELS } from "@/lib/labels";
import type { PlaceType, AdminOverride } from "@/lib/types";
import { X, Save, AlertCircle } from "lucide-react";

interface OverrideFormProps {
  override?: AdminOverride | null;
  onClose: () => void;
  onSave: (data: Partial<AdminOverride>) => Promise<void>;
  preFill?: { placeId?: string; type?: string };
}

export default function OverrideForm({ override, onClose, onSave, preFill }: OverrideFormProps) {
  const [placeId, setPlaceId] = useState(override?.place_id || preFill?.placeId || "");
  const [forcedType, setForcedType] = useState<PlaceType>(override?.forced_type || (preFill?.type as PlaceType) || "factory");
  const [forcedSubtype, setForcedSubtype] = useState(override?.forced_subtype || "");
  const [notes, setNotes] = useState(override?.notes || "");
  const [isActive, setIsActive] = useState(override ? override.is_active : true);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave({
        place_id: placeId,
        forced_type: forcedType,
        forced_subtype: forcedSubtype,
        notes,
        is_active: isActive,
      });
      onClose();
    } catch (error) {
      alert("Hata: " + (error instanceof Error ? error.message : "Kaydedilemedi"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-800 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95">
        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-xl font-heading font-bold dark:text-white">
            {override ? "Override Düzenle" : "Yeni Override Oluştur"}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Place ID</label>
            <input
              type="text"
              value={placeId}
              onChange={(e) => setPlaceId(e.target.value)}
              disabled={!!override}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-sm font-mono outline-none border-2 border-transparent focus:border-primary transition-all dark:text-white disabled:opacity-50"
              placeholder="node/12345678"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Zorunlu Tip</label>
              <select
                value={forcedType}
                onChange={(e) => setForcedType(e.target.value as PlaceType)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all dark:text-white"
              >
                {Object.entries(PLACE_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Alt Tip (Opsiyonel)</label>
              <input
                type="text"
                value={forcedSubtype}
                onChange={(e) => setForcedSubtype(e.target.value)}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-sm outline-none border-2 border-transparent focus:border-primary transition-all dark:text-white"
                placeholder="Örn: CNC Atölyesi"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-1">Notlar</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full h-24 px-4 py-3 bg-slate-50 dark:bg-slate-900 rounded-xl text-sm font-body outline-none border-2 border-transparent focus:border-primary transition-all dark:text-white resize-none"
              placeholder="Override nedeni veya detaylar..."
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${isActive ? "bg-emerald-500" : "bg-slate-300"}`} />
              <span className="text-sm font-bold dark:text-white">Override Aktif</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input 
                type="checkbox" 
                className="sr-only peer" 
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
            </label>
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 bg-slate-100 dark:bg-slate-700 rounded-2xl font-bold text-slate-600 dark:text-slate-300 transition-all"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-4 bg-primary text-white font-bold rounded-2xl shadow-lg hover:shadow-primary/30 transition-all disabled:opacity-50"
            >
              <div className="flex items-center justify-center gap-2">
                <Save className="w-5 h-5" />
                {isSaving ? "Kaydediliyor..." : "Kaydet"}
              </div>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
