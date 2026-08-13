"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Place, PlaceType, ReportData } from "@/lib/types";
import { PLACE_TYPE_LABELS } from "@/lib/labels";
import { reportPlace } from "@/lib/api";

interface ReportModalProps {
  place: Place;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ReportModal({ place, isOpen, onClose, onSuccess }: ReportModalProps) {
  const [correctedType, setCorrectedType] = useState<PlaceType>(place.type);
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const reportData: ReportData = {
      placeId: place.id,
      placeName: place.name,
      currentType: place.type,
      correctedType,
      notes: notes.trim() || undefined,
      lat: place.coordinates.lat,
      lon: place.coordinates.lng,
    };

    try {
      await reportPlace(reportData);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Bildirim gönderilemedi. Lütfen tekrar deneyin.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all">
        <div className="flex items-center justify-between p-6 border-b dark:border-slate-700">
          <h2 className="text-xl font-heading font-bold text-slate-900 dark:text-white">
            Yanlış mı? Bildir
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
          >
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <p className="text-sm font-body text-slate-600 dark:text-slate-400 mb-1">
              Yer Adı
            </p>
            <p className="text-base font-body font-semibold text-slate-900 dark:text-white">
              {place.name}
            </p>
          </div>

          <div>
            <p className="text-sm font-body text-slate-600 dark:text-slate-400 mb-1">
              Şu Anki Tip
            </p>
            <p className="text-base font-body font-semibold text-slate-900 dark:text-white">
              {PLACE_TYPE_LABELS[place.type]}
            </p>
          </div>

          <div>
            <label className="block text-sm font-heading font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Doğru Tip Nedir?
            </label>
            <select
              value={correctedType}
              onChange={(e) => setCorrectedType(e.target.value as PlaceType)}
              className="w-full px-4 py-3 rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-body focus:outline-none focus:border-primary transition-colors cursor-pointer"
            >
              {(Object.entries(PLACE_TYPE_LABELS) as [PlaceType, string][]).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-heading font-semibold text-slate-700 dark:text-slate-300 mb-2">
              Notlar (İsteğe Bağlı)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Eklemek istediğiniz bilgileri buraya yazabilirsiniz..."
              className="w-full px-4 py-3 rounded-lg border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white font-body focus:outline-none focus:border-primary transition-colors min-h-[100px] resize-none"
            />
          </div>

          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 font-body bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-100 dark:border-red-900/30">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 rounded-lg border-2 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-heading font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
            >
              Vazgeç
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 rounded-lg bg-primary text-white font-heading font-bold hover:bg-primary-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Gönderiliyor..." : "Gönder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
