"use client";

import React, { useState } from "react";
import { CalendarClock, User } from "lucide-react";
import type { ContactEvent, ContactEventCreate, ContactStatus } from "../lib/savedApi";
import {
  addDays,
  CONTACT_STATUS_LABELS,
  CONTACT_STATUS_TONES,
  formatDay,
  localDateInputValue,
} from "../lib/contactTracking";

export function StatusBadge({ status }: { status: ContactStatus }) {
  return (
    <span className={`inline-flex rounded-input px-2 py-0.5 text-2xs font-medium ${CONTACT_STATUS_TONES[status]}`}>
      {CONTACT_STATUS_LABELS[status]}
    </span>
  );
}

/** Takip tarihi kisayollari: gonullu cogunlukla "bir hafta sonra ara" diyor. */
const FOLLOW_UP_PRESETS: { label: string; days: number }[] = [
  { label: "3 gün", days: 3 },
  { label: "1 hafta", days: 7 },
  { label: "2 hafta", days: 14 },
  { label: "1 ay", days: 30 },
];

interface ContactFormProps {
  initialStatus: ContactStatus;
  onSubmit: (data: ContactEventCreate) => Promise<void>;
  onCancel: () => void;
}

/**
 * Temas kaydi. Durum tek tikla (acilir liste degil), takip tarihi
 * kisayolla; en sik yol "aradim, bir hafta sonra tekrar" iki tiklik.
 */
export function ContactForm({ initialStatus, onSubmit, onCancel }: ContactFormProps) {
  const [status, setStatus] = useState<ContactStatus>(
    // Yeni temas "hic temas edilmedi" olamaz; varsayilan ilerletiliyor.
    initialStatus === "uncontacted" ? "contacted" : initialStatus
  );
  const [contactedAt, setContactedAt] = useState(localDateInputValue);
  const [followUpAt, setFollowUpAt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        status,
        contacted_at: contactedAt,
        note: note.trim() || null,
        next_follow_up_at: followUpAt || null,
      });
    } catch (err: any) {
      setError(err?.message || "Temas kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const fieldClass =
    "w-full rounded-input border border-rule-2 bg-paper px-2.5 py-1.5 text-xs text-ink hover:border-ink-4 focus:border-accent";

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-card border border-rule bg-paper-2 p-3">
      <fieldset>
        <legend className="mono-label mb-1.5">Sonuç</legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CONTACT_STATUS_LABELS) as ContactStatus[])
            .filter((s) => s !== "uncontacted")
            .map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={`rounded-input border px-2.5 py-1 text-2xs font-medium transition-colors duration-fast ease-out ${
                  status === s ? "border-accent bg-accent text-accent-ink" : "border-rule-2 bg-paper text-ink-2 hover:border-ink-4"
                }`}
              >
                {CONTACT_STATUS_LABELS[s]}
              </button>
            ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mono-label mb-1 block">Temas tarihi</span>
          <input
            required
            type="date"
            value={contactedAt}
            max={localDateInputValue()}
            onChange={(e) => setContactedAt(e.target.value)}
            className={fieldClass}
          />
        </label>
        <label className="block">
          <span className="mono-label mb-1 block">Sonraki takip</span>
          <input
            type="date"
            value={followUpAt}
            min={contactedAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
            className={fieldClass}
          />
          <span className="mt-1.5 flex flex-wrap gap-1">
            {FOLLOW_UP_PRESETS.map(({ label, days }) => (
              <button
                key={days}
                type="button"
                onClick={() => setFollowUpAt(addDays(contactedAt, days))}
                className="rounded-input border border-rule-2 bg-paper px-1.5 py-0.5 text-2xs text-ink-3 hover:border-accent hover:text-accent"
              >
                +{label}
              </button>
            ))}
          </span>
        </label>
      </div>

      <label className="block">
        <span className="mono-label mb-1 block">Görüşme notu</span>
        <textarea
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={2000}
          placeholder="Kiminle görüşüldü, ne konuşuldu?"
          className={`${fieldClass} resize-y`}
        />
      </label>

      {error && <p className="text-2xs text-critical">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn btn--ghost px-3 py-1.5 text-2xs">
          Vazgeç
        </button>
        <button type="submit" disabled={saving} className="btn btn--primary px-3 py-1.5 text-2xs disabled:opacity-50">
          {saving ? "Kaydediliyor…" : "Temas kaydet"}
        </button>
      </div>
    </form>
  );
}

/** Temas gecmisi, en yeni ustte; zaman cizelgesi gorunumu. */
export function ContactHistory({ items }: { items: ContactEvent[] }) {
  if (items.length === 0) {
    return <p className="mt-3 text-2xs text-ink-4">Henüz temas kaydı yok. İlk görüşmeden sonra “Temas ekle” ile kaydedin.</p>;
  }
  return (
    <ol className="mt-3 space-y-3 border-l border-rule pl-4">
      {items.map((item) => (
        <li key={item.id} className="relative">
          <span aria-hidden="true" className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-accent" />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="tabular text-xs font-medium text-ink">{formatDay(item.contacted_at)}</span>
            <StatusBadge status={item.status} />
            <span className="inline-flex items-center gap-1 text-2xs text-ink-3">
              <User size={10} aria-hidden="true" />
              {item.volunteer_name}
            </span>
          </div>
          {item.note && <p className="mt-1 whitespace-pre-line text-xs text-ink-2">{item.note}</p>}
          {item.next_follow_up_at && (
            <p className="mt-1 inline-flex items-center gap-1 text-2xs text-ink-3">
              <CalendarClock size={10} aria-hidden="true" />
              Takip: {formatDay(item.next_follow_up_at)}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
