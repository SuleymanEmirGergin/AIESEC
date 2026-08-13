"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { Place, PlaceType, ReportData } from "@/lib/types";
import { PLACE_TYPE_LABELS } from "@/lib/labels";
import { reportPlace } from "@/lib/api";
import ModalShell from "./ModalShell";

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

  const unchanged = correctedType === place.type;

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="Veri düzeltme"
      title="Yanlış sınıflandırma bildir"
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Baglami tablo gibi veriyoruz: iki alan, hairline ile ayrilmis.
            Onceden ayni bilgi ust uste iki paragraf blogu halindeydi ve
            hangi degerin neye ait oldugu okunurken kayboluyordu. */}
        <dl className="rounded-input border border-rule divide-y divide-rule">
          <div className="flex items-baseline gap-3 px-3 py-2.5">
            <dt className="mono-label shrink-0 w-20">Yer</dt>
            <dd className="min-w-0 text-sm text-ink break-words">{place.name}</dd>
          </div>
          <div className="flex items-baseline gap-3 px-3 py-2.5">
            <dt className="mono-label shrink-0 w-20">Şu anki</dt>
            <dd className="text-sm text-ink">{PLACE_TYPE_LABELS[place.type]}</dd>
          </div>
        </dl>

        <div className="space-y-2">
          <label
            htmlFor="report-correct-type"
            className="block text-xs font-medium text-ink"
          >
            Doğru tür ne olmalı?
          </label>
          <select
            id="report-correct-type"
            value={correctedType}
            onChange={(e) => setCorrectedType(e.target.value as PlaceType)}
            className="w-full rounded-input border border-rule-2 bg-paper px-3 py-2.5 text-sm text-ink transition-colors duration-fast ease-out hover:border-ink-4 focus:border-accent"
          >
            {(Object.entries(PLACE_TYPE_LABELS) as [PlaceType, string][]).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              )
            )}
          </select>
          {/* Onceden secim degismeden de gonderilebiliyordu ve backend'e
              "su anki tur = dogru tur" diyen bos bir rapor gidiyordu. */}
          {unchanged && (
            <p className="text-2xs text-ink-4">
              Göndermek için mevcut türden farklı bir tür seçin.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="report-notes" className="block text-xs font-medium text-ink">
            Not <span className="text-ink-4 font-normal">· isteğe bağlı</span>
          </label>
          <textarea
            id="report-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Örn. tabelada 'Anadolu Lisesi' yazıyor."
            className="w-full resize-none rounded-input border border-rule-2 bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 transition-colors duration-fast ease-out hover:border-ink-4 focus:border-accent"
          />
        </div>

        {error && (
          // role="alert": hata ekrandan sonra basiliyor, ekran okuyucu
          // kullanicinin bunu fark etmesi icin duyurulmasi gerek.
          <p
            role="alert"
            className="flex items-start gap-2 rounded-input border border-rule bg-paper-2 px-3 py-2.5 text-xs text-critical"
          >
            <AlertCircle size={14} className="mt-px shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="btn btn--ghost flex-1 px-4 py-2.5"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={isSubmitting || unchanged}
            className="btn btn--primary flex-1 px-4 py-2.5"
          >
            {isSubmitting ? "Gönderiliyor…" : "Bildirimi gönder"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
