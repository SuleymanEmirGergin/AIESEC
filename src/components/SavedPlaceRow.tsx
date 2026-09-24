"use client";

import React, { useEffect, useState } from "react";
import { MapPin, Trash2, FolderInput, Check } from "lucide-react";
import ContactLinks from "./ContactLinks";
import { PLACE_TYPE_LABELS } from "../lib/labels";
import { fetchContactEvents, type ContactEvent, type ContactEventCreate, type ContactStatus, type PlaceListSummary, type SavedPlace } from "../lib/savedApi";
import type { PlaceType } from "../lib/types";
import { CONTACT_STATUS_LABELS, localDateInputValue } from "../lib/contactTracking";

interface SavedPlaceRowProps {
  place: SavedPlace;
  lists: PlaceListSummary[];
  onSaveNote: (id: string, note: string) => Promise<void>;
  onMove: (id: string, listId: string | null) => void;
  onRemove: (id: string) => void;
  onAddContact: (id: string, data: ContactEventCreate) => Promise<void>;
  onHistoryError: (message: string) => void;
}

const dateFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
});

/**
 * Kayitli bir yerin satiri.
 *
 * Not alani satir ici: gonullu bir okulla gorustukten sonra "mudur
 * yardimcisi ilgilendi, eylulde tekrar ara" yazacak. Bunun icin modal
 * acmak, dort tiklik bir is icin fazla (DESIGN.md: yikici olmayan
 * islemlerde onay diyalogu yok).
 *
 * Kaydeden kisi ve tarih her satirda: ekip donusken, devir teslim
 * arayuzun isi (PRODUCT.md ilke 5).
 */
export default function SavedPlaceRow({
  place,
  lists,
  onSaveNote,
  onMove,
  onRemove,
  onAddContact,
  onHistoryError,
}: SavedPlaceRowProps) {
  const [note, setNote] = useState(place.note ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
  const [contactStatus, setContactStatus] = useState<ContactStatus>(place.contact_status);
  const [contactedAt, setContactedAt] = useState(localDateInputValue);
  const [contactNote, setContactNote] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [contactError, setContactError] = useState<string | null>(null);
  const [history, setHistory] = useState<ContactEvent[] | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Dis kaynak degisirse (baska bir listeye tasindi, yenilendi) yerel
  // taslak degil gercek deger gosterilsin.
  useEffect(() => {
    setNote(place.note ?? "");
  }, [place.note]);

  const dirty = note.trim() !== (place.note ?? "").trim();

  const commit = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      await onSaveNote(place.id, note.trim());
      setSaved(true);
      // Sessiz basari: kucuk bir onay, kutlama yok (DESIGN.md).
      setTimeout(() => setSaved(false), 1600);
    } finally {
      setSaving(false);
    }
  };

  const typeLabel =
    PLACE_TYPE_LABELS[place.place_type as PlaceType] ?? place.place_type ?? "—";

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await fetchContactEvents(place.id));
    } catch (err: any) {
      const message = err?.message || "Temas geçmişi yüklenemedi.";
      setHistoryError(message);
      onHistoryError(message);
    } finally { setHistoryLoading(false); }
  };

  const submitContact = async (event: React.FormEvent) => {
    event.preventDefault();
    setContactError(null);
    try {
      await onAddContact(place.id, { status: contactStatus, contacted_at: contactedAt, note: contactNote || null, next_follow_up_at: followUpAt || null });
      setContactOpen(false);
      await loadHistory();
    } catch (err: any) { setContactError(err?.message || "Temas kaydedilemedi."); }
  };

  return (
    <li className="rule-b last:border-b-0">
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-sm font-medium leading-snug text-ink">
              {place.name || "İsimsiz Yer"}
            </h3>

            {place.address && place.address !== "Adres bilgisi yok" && (
              <p className="mt-0.5 text-2xs text-ink-3">{place.address}</p>
            )}

            <div className="mt-1.5">
              <ContactLinks tags={place.tags} variant="compact" />
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <a
              href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${place.lat}/${place.lon}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${place.name ?? "Yer"} haritada`}
              className="rounded-input p-1.5 text-ink-4 transition-colors duration-fast ease-out hover:bg-paper-2 hover:text-accent"
            >
              <MapPin size={13} aria-hidden="true" />
            </a>

            {/* Tasima bir select: listeler az sayida ve isimleri kisa.
                Ayri bir modal acmak bu is icin agir kacardi. */}
            <label className="sr-only" htmlFor={`move-${place.id}`}>
              {place.name ?? "Yer"} kaydını başka listeye taşı
            </label>
            <div className="relative inline-flex items-center">
              <FolderInput
                size={13}
                aria-hidden="true"
                className="pointer-events-none absolute left-1.5 text-ink-4"
              />
              <select
                id={`move-${place.id}`}
                value={place.list_id ?? ""}
                onChange={(e) => onMove(place.id, e.target.value || null)}
                className="appearance-none rounded-input border border-transparent bg-transparent py-1 pl-6 pr-2 text-2xs text-ink-3 transition-colors duration-fast ease-out hover:border-rule-2 hover:text-ink focus:border-accent"
              >
                <option value="">Dosyalanmamış</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => onRemove(place.id)}
              aria-label={`${place.name ?? "Yer"} kaydını kaldır`}
              className="rounded-input p-1.5 text-ink-4 transition-colors duration-fast ease-out hover:bg-paper-2 hover:text-critical"
            >
              <Trash2 size={13} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="mono-label">{typeLabel}</span>
          <span className="mono-label">{CONTACT_STATUS_LABELS[place.contact_status]}</span>
          {place.next_follow_up_at && <span className="mono-label tabular">Takip zamanı: {place.next_follow_up_at}</span>}

          {/* Kim, ne zaman - devir teslimin tasiyicisi. */}
          <span className="mono-label tabular">
            {dateFormat.format(new Date(place.created_at))}
            {place.saved_by ? ` · ${place.saved_by}` : ""}
          </span>
        </div>

        <div className="mt-2 flex items-start gap-2">
          <label className="sr-only" htmlFor={`note-${place.id}`}>
            {place.name ?? "Yer"} için not
          </label>
          <input
            id={`note-${place.id}`}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            placeholder="Not ekle — kiminle görüşüldü, ne zaman aranacak"
            className="w-full rounded-input border border-transparent bg-paper-2 px-2.5 py-1.5 text-2xs text-ink placeholder:text-ink-4 transition-colors duration-fast ease-out hover:border-rule-2 focus:border-accent focus:bg-paper"
          />
          {saved && (
            <span
              role="status"
              className="mt-1 inline-flex shrink-0 items-center gap-1 text-2xs text-positive"
            >
              <Check size={11} aria-hidden="true" />
              Kaydedildi
            </span>
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => setContactOpen((open) => !open)} className="btn btn--ghost px-2.5 py-1.5 text-2xs">Temas ekle</button>
          <button type="button" onClick={() => {
            if (!historyVisible && history === null) loadHistory();
            setHistoryVisible((visible) => !visible);
          }} className="btn btn--ghost px-2.5 py-1.5 text-2xs">{historyVisible ? "Geçmişi gizle" : "Geçmişi göster"}</button>
        </div>

        {contactOpen && (
          <form onSubmit={submitContact} className="mt-2.5 grid gap-2 rounded-input bg-paper-2 p-2.5 text-2xs">
            <select value={contactStatus} onChange={(e) => setContactStatus(e.target.value as ContactStatus)} className="rounded-input border border-rule bg-paper px-2 py-1.5">
              {Object.entries(CONTACT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <label>Temas tarihi<input required type="date" value={contactedAt} onChange={(e) => setContactedAt(e.target.value)} className="ml-2 rounded-input border border-rule bg-paper px-2 py-1" /></label>
            <label>Takip tarihi<input type="date" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} className="ml-2 rounded-input border border-rule bg-paper px-2 py-1" /></label>
            <input value={contactNote} onChange={(e) => setContactNote(e.target.value)} placeholder="Not" className="rounded-input border border-rule bg-paper px-2 py-1.5" />
            {contactError && <p className="text-critical">{contactError}</p>}
            <button className="btn btn--primary justify-center px-3 py-1.5 text-2xs">Kaydet</button>
          </form>
        )}
        {historyVisible && historyLoading && <p className="mt-2 mono-label">Geçmiş yükleniyor</p>}
        {historyVisible && historyError && <p className="mt-2 text-2xs text-critical">{historyError}</p>}
        {historyVisible && history && <ol className="mt-2 space-y-1 text-2xs text-ink-3">{history.map((item) => <li key={item.id}>{item.contacted_at} · {CONTACT_STATUS_LABELS[item.status]} · {item.volunteer_name}{item.note ? ` · ${item.note}` : ""}</li>)}</ol>}
      </div>
    </li>
  );
}
