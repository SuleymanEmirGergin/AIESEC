"use client";

import { useState } from "react";
import { PLACE_TYPE_LABELS } from "@/lib/labels";
import type { PlaceType, AdminOverride } from "@/lib/types";
import { AlertCircle } from "lucide-react";
import ModalShell from "./ModalShell";

interface OverrideFormProps {
  override?: AdminOverride | null;
  onClose: () => void;
  onSave: (data: Partial<AdminOverride>) => Promise<void>;
  preFill?: { placeId?: string; type?: string };
}

export default function OverrideForm({
  override,
  onClose,
  onSave,
  preFill,
}: OverrideFormProps) {
  const [placeId, setPlaceId] = useState(override?.place_id || preFill?.placeId || "");
  const [forcedType, setForcedType] = useState<PlaceType>(
    override?.forced_type || (preFill?.type as PlaceType) || "factory"
  );
  const [forcedSubtype, setForcedSubtype] = useState(override?.forced_subtype || "");
  const [notes, setNotes] = useState(override?.notes || "");
  const [isActive, setIsActive] = useState(override ? override.is_active : true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        place_id: placeId.trim(),
        forced_type: forcedType,
        // Bos alt tip gonderilmiyor: backend bos stringi gecerli bir
        // alt tip sanip sonuclara bos bir etiket yaziyordu.
        forced_subtype: forcedSubtype.trim() || undefined,
        notes: notes.trim() || undefined,
        is_active: isActive,
      });
      onClose();
    } catch (err) {
      // Onceden burada alert() vardi: tarayici diyalogu formun disinda
      // duruyor, girilen degerleri gostermiyor ve hatayi duzeltirken
      // kullaniciyi baglamdan koparıyordu.
      setError(err instanceof Error ? err.message : "Kaydedilemedi.");
    } finally {
      setIsSaving(false);
    }
  };

  const fieldClass =
    "w-full rounded-input border border-rule-2 bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 transition-colors duration-fast ease-out hover:border-ink-4 focus:border-accent disabled:opacity-50 disabled:hover:border-rule-2";

  return (
    <ModalShell
      isOpen
      onClose={onClose}
      eyebrow="Sınıflandırma"
      title={override ? "Override düzenle" : "Yeni override"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="ov-place-id" className="block text-xs font-medium text-ink">
            Place ID
          </label>
          <input
            id="ov-place-id"
            type="text"
            value={placeId}
            onChange={(e) => setPlaceId(e.target.value)}
            // Mevcut bir kaydin place_id'si degistirilemez: backend bunu
            // benzersiz anahtar olarak kullaniyor.
            disabled={!!override}
            placeholder="osm:node:12345678"
            autoComplete="off"
            spellCheck={false}
            required
            className={`tabular ${fieldClass}`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="ov-type" className="block text-xs font-medium text-ink">
              Zorunlu tür
            </label>
            <select
              id="ov-type"
              value={forcedType}
              onChange={(e) => setForcedType(e.target.value as PlaceType)}
              className={fieldClass}
            >
              {Object.entries(PLACE_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label htmlFor="ov-subtype" className="block text-xs font-medium text-ink">
              Alt tür <span className="font-normal text-ink-4">· isteğe bağlı</span>
            </label>
            <input
              id="ov-subtype"
              type="text"
              value={forcedSubtype}
              onChange={(e) => setForcedSubtype(e.target.value)}
              placeholder="Örn. CNC atölyesi"
              className={fieldClass}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="ov-notes" className="block text-xs font-medium text-ink">
            Not <span className="font-normal text-ink-4">· isteğe bağlı</span>
          </label>
          <textarea
            id="ov-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Override nedeni"
            className={`resize-none ${fieldClass}`}
          />
        </div>

        {/*
          Onceden burada özel bir "toggle switch" vardi: gorunur bir
          checkbox degil, sr-only bir input + peer secicileriyle cizilmis
          bir kaydirak. Klavye odaginda hicbir gorsel iz birakmiyordu.
          Standart bir checkbox hem odak halkasini hem de durumu tarayici
          duzeyinde dogru veriyor.
        */}
        <label className="flex cursor-pointer items-center gap-2.5 rounded-input border border-rule bg-paper-2 px-3 py-2.5">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-3.5 w-3.5 accent-accent"
          />
          <span className="text-xs text-ink">Override aktif</span>
          <span className="mono-label ml-auto">
            {isActive ? "Uygulanıyor" : "Devre dışı"}
          </span>
        </label>

        {error && (
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
            disabled={isSaving || !placeId.trim()}
            className="btn btn--primary flex-1 px-4 py-2.5"
          >
            {isSaving ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
