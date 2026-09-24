"use client";

import { useEffect, useState } from "react";
import { adminApi } from "@/lib/adminApi";
import type { AdminReport, ReportStatus } from "@/lib/types";
import { PLACE_TYPE_LABELS } from "@/lib/labels";
import { X, ExternalLink, Plus, AlertCircle } from "lucide-react";

interface AdminReportDetailProps {
  report: AdminReport;
  onClose: () => void;
  onUpdate: () => void;
  onCreateOverride?: (placeId: string, correctedType: any) => void;
}

const STATUS_OPTIONS: { value: ReportStatus; label: string }[] = [
  { value: "open", label: "Açık" },
  { value: "resolved", label: "Çözüldü" },
  { value: "ignored", label: "Yoksay" },
];

/**
 * Rapor detayi saga acilan bir cekmece (drawer).
 *
 * Ortadaki ModalShell yerine kendi kabugunu tasiyor: bu panel bir karar
 * formu ve arkasindaki tablo baglami acikken gorunur kalmali. Escape ve
 * kaydirma kilidi yine de gerekli - onceden ikisi de yoktu.
 */
export default function AdminReportDetail({
  report,
  onClose,
  onUpdate,
  onCreateOverride,
}: AdminReportDetailProps) {
  const [status, setStatus] = useState<ReportStatus>(report.status);
  const [adminNotes, setAdminNotes] = useState(report.admin_notes || "");
  const [tags, setTags] = useState<string[]>(report.tags || []);
  const [newTag, setNewTag] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await adminApi.updateReport(report.id, { status, admin_notes: adminNotes, tags });
      onUpdate();
      onClose();
    } catch (err) {
      // alert() yerine satir ici hata: tarayici diyalogu formun disinda
      // duruyor ve kullaniciyi girdiginin baglamindan koparıyordu.
      setError(err instanceof Error ? err.message : "Rapor güncellenemedi.");
    } finally {
      setIsSaving(false);
    }
  };

  const addTag = () => {
    const value = newTag.trim();
    if (value && !tags.includes(value)) {
      setTags([...tags, value]);
      setNewTag("");
    }
  };

  const osmUrl = `https://www.openstreetmap.org/?mlat=${report.coordinates.lat}&mlon=${report.coordinates.lng}#map=18/${report.coordinates.lat}/${report.coordinates.lng}`;

  const fieldClass =
    "w-full rounded-input border border-rule-2 bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 transition-colors duration-fast ease-out hover:border-ink-4 focus:border-accent";

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-scrim backdrop-blur-[2px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Rapor detayı"
        className="relative flex h-full w-full max-w-xl flex-col border-l border-rule-2 bg-paper shadow-modal"
      >
        <div className="flex items-start gap-4 rule-b px-5 py-4">
          <div className="min-w-0">
            <p className="mono-label mb-1">Rapor · {report.id}</p>
            <h2 className="font-display text-lg font-semibold text-ink leading-tight break-words">
              {report.placeName || "İsimsiz"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="ml-auto shrink-0 rounded-input p-1.5 text-ink-4 hover:bg-paper-2 hover:text-ink transition-colors duration-fast ease-out"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <dl className="rounded-input border border-rule divide-y divide-rule">
            <div className="flex items-baseline gap-3 px-3 py-2.5">
              <dt className="mono-label w-24 shrink-0">Sistemdeki</dt>
              <dd className="text-sm text-ink">
                {PLACE_TYPE_LABELS[report.currentType] ?? report.currentType}
              </dd>
            </div>
            <div className="flex items-baseline gap-3 px-3 py-2.5">
              <dt className="mono-label w-24 shrink-0">Önerilen</dt>
              <dd className="text-sm font-medium text-accent">
                {PLACE_TYPE_LABELS[report.correctedType] ?? report.correctedType}
              </dd>
            </div>
            <div className="flex items-baseline gap-3 px-3 py-2.5">
              <dt className="mono-label w-24 shrink-0">Konum</dt>
              <dd className="tabular text-sm text-ink">
                {report.coordinates.lat.toFixed(5)}, {report.coordinates.lng.toFixed(5)}
              </dd>
            </div>
          </dl>

          <a
            href={osmUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-accent underline decoration-accent-edge underline-offset-4 transition-colors duration-fast ease-out hover:decoration-accent"
          >
            OpenStreetMap&apos;te aç <ExternalLink size={12} />
          </a>

          {report.notes && (
            <blockquote className="rounded-input border-l-2 border-rule-2 bg-paper-2 px-3 py-2.5 text-xs leading-relaxed text-ink-2">
              {report.notes}
            </blockquote>
          )}

          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-medium text-ink">Durum</legend>
            <div className="flex gap-1.5">
              {STATUS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={status === option.value}
                  onClick={() => setStatus(option.value)}
                  className={`flex-1 rounded-input border px-3 py-2 text-xs font-medium transition-colors duration-fast ease-out ${
                    status === option.value
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-rule-2 text-ink-2 hover:bg-paper-2 hover:text-ink"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <label htmlFor="admin-notes" className="block text-xs font-medium text-ink">
              Yönetici notu
            </label>
            <textarea
              id="admin-notes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={4}
              placeholder="Bu rapor hakkında not"
              className={`resize-none ${fieldClass}`}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="new-tag" className="block text-xs font-medium text-ink">
              Etiketler
            </label>

            {tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <li
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-chip border border-rule bg-paper-2 py-1 pl-2 pr-1 text-2xs text-ink-2"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => setTags(tags.filter((t) => t !== tag))}
                      aria-label={`${tag} etiketini kaldır`}
                      className="rounded-chip p-0.5 text-ink-4 hover:text-critical transition-colors duration-fast ease-out"
                    >
                      <X size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex gap-1.5">
              <input
                id="new-tag"
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                // onKeyPress kullanimdan kalkti; onKeyDown hem daha genis
                // destekleniyor hem de Enter'in formu gondermesini
                // engellemek icin dogru yer.
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="Yeni etiket"
                className={`flex-1 ${fieldClass}`}
              />
              <button
                type="button"
                onClick={addTag}
                disabled={!newTag.trim()}
                aria-label="Etiket ekle"
                className="btn btn--ghost px-3 py-2.5"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {onCreateOverride && (
            <button
              type="button"
              onClick={() => onCreateOverride(report.placeId, report.correctedType)}
              className="btn btn--ghost w-full px-4 py-2.5"
            >
              Bu rapordan override oluştur
            </button>
          )}

          {error && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-input border border-rule bg-paper-2 px-3 py-2.5 text-xs text-critical"
            >
              <AlertCircle size={14} className="mt-px shrink-0" />
              <span>{error}</span>
            </p>
          )}
        </div>

        <div className="flex gap-2 rule-t bg-paper-2 px-5 py-4">
          <button type="button" onClick={onClose} className="btn btn--ghost flex-1 px-4 py-2.5">
            Vazgeç
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="btn btn--primary flex-[2] px-4 py-2.5"
          >
            {isSaving ? "Kaydediliyor…" : "Raporu güncelle"}
          </button>
        </div>
      </div>
    </div>
  );
}
