"use client";

import React, { useEffect, useState } from "react";
import { MapPin, Trash2, FolderInput, Check, CalendarClock, History, MessageSquarePlus, UserRound } from "lucide-react";
import ContactLinks from "./ContactLinks";
import QuickActions from "./QuickActions";
import { PLACE_TYPE_LABELS } from "../lib/labels";
import {
  fetchContactEvents,
  type Assignee,
  type ContactEvent,
  type ContactEventCreate,
  type PlaceListSummary,
  type SavedPlace,
} from "../lib/savedApi";
import type { PlaceType } from "../lib/types";
import { formatDay, isOverdue } from "../lib/contactTracking";
import { ContactForm, ContactHistory, StatusBadge } from "./ContactPanel";

interface SavedPlaceRowProps {
  place: SavedPlace;
  lists: PlaceListSummary[];
  members: Assignee[];
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onSaveNote: (id: string, note: string) => Promise<void>;
  onMove: (id: string, listId: string | null) => void;
  onAssign: (id: string, assignee: Assignee | null) => void;
  onRemove: (id: string) => void;
  onAddContact: (id: string, data: ContactEventCreate) => Promise<void>;
  onHistoryError: (message: string) => void;
}

const dateFormat = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short" });

const pill =
  "appearance-none rounded-input border border-transparent bg-transparent py-1 pl-6 pr-2 text-2xs text-ink-3 transition-colors duration-fast ease-out hover:border-rule-2 hover:text-ink focus:border-accent max-w-[11rem] truncate";

/**
 * Kayitli bir yerin satiri.
 *
 * Not alani satir ici: gonullu bir okulla gorustukten sonra "mudur
 * yardimcisi ilgilendi, eylulde tekrar ara" yazacak. Bunun icin modal
 * acmak, dort tiklik bir is icin fazla.
 *
 * Kaydeden, sorumlu ve kimin atadigi her satirda: ekip donusken devir
 * teslim arayuzun isi. memo: sayfada 50 satir var, birini degistirmek
 * digerlerini yeniden cizmemeli (cagiranin callback'leri sabit).
 */
function SavedPlaceRow({
  place,
  lists,
  members,
  selected,
  onToggleSelect,
  onSaveNote,
  onMove,
  onAssign,
  onRemove,
  onAddContact,
  onHistoryError,
}: SavedPlaceRowProps) {
  const [note, setNote] = useState(place.note ?? "");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);
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
      setTimeout(() => setSaved(false), 1600);
    } finally {
      setSaving(false);
    }
  };

  const typeLabel = PLACE_TYPE_LABELS[place.place_type as PlaceType] ?? place.place_type ?? "—";

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      setHistory(await fetchContactEvents(place.id));
    } catch (err: any) {
      const message = err?.message || "Temas geçmişi yüklenemedi.";
      setHistoryError(message);
      onHistoryError(message);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Hata ContactForm'da gosteriliyor; basarida gecmis acilip tazeleniyor.
  const submitContact = async (data: ContactEventCreate) => {
    await onAddContact(place.id, data);
    setContactOpen(false);
    setHistoryVisible(true);
    await loadHistory();
  };

  const overdue = isOverdue(place, new Date());
  // Sorumlu ekipten cikarilmissa da secenek olarak gorunsun (adiyla).
  const assigneeOptions =
    place.assigned_to && !members.some((m) => m.email === place.assigned_to)
      ? [...members, { email: place.assigned_to, name: place.assigned_name ?? place.assigned_to }]
      : members;

  return (
    <li id={`kayit-${place.id}`} className={`rule-b last:border-b-0 ${selected ? "bg-accent-wash" : ""}`}>
      <div className="px-4 py-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(place.id)}
            aria-label={`${place.name ?? "Yer"} seç`}
            className="mt-1 h-4 w-4 shrink-0 accent-accent"
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-sm font-medium leading-snug text-ink">{place.name || "İsimsiz Yer"}</h3>
            {(place.district_name || (place.address && place.address !== "Adres bilgisi yok")) && (
              <p className="mt-0.5 text-2xs text-ink-3">
                {place.district_name && <span className="font-medium text-ink-2">{place.district_name}</span>}
                {place.district_name && place.address && place.address !== "Adres bilgisi yok" ? " · " : ""}
                {place.address && place.address !== "Adres bilgisi yok" ? place.address : ""}
              </p>
            )}
            <div className="mt-1.5 hidden sm:block">
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

        <QuickActions tags={place.tags} className="mt-2.5 sm:hidden" />

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <StatusBadge status={place.contact_status} />
          <span className="mono-label">{typeLabel}</span>

          <label className="sr-only" htmlFor={`assign-${place.id}`}>
            {place.name ?? "Yer"} için sorumlu
          </label>
          <span className="relative inline-flex items-center">
            <UserRound size={12} aria-hidden="true" className={`pointer-events-none absolute left-1.5 ${place.assigned_to ? "text-accent" : "text-ink-4"}`} />
            <select
              id={`assign-${place.id}`}
              value={place.assigned_to ?? ""}
              onChange={(e) => onAssign(place.id, assigneeOptions.find((m) => m.email === e.target.value) ?? null)}
              title={place.assigned_by ? `${place.assigned_by} atadı${place.assigned_at ? ` · ${dateFormat.format(new Date(place.assigned_at))}` : ""}` : undefined}
              className={`${pill} ${place.assigned_to ? "font-medium text-ink" : ""}`}
            >
              <option value="">Sorumlu yok</option>
              {assigneeOptions.map((m) => (
                <option key={m.email} value={m.email}>
                  {m.name}
                </option>
              ))}
            </select>
          </span>

          <label className="sr-only" htmlFor={`move-${place.id}`}>
            {place.name ?? "Yer"} kaydını başka listeye taşı
          </label>
          <span className="relative inline-flex items-center">
            <FolderInput size={12} aria-hidden="true" className="pointer-events-none absolute left-1.5 text-ink-4" />
            <select id={`move-${place.id}`} value={place.list_id ?? ""} onChange={(e) => onMove(place.id, e.target.value || null)} className={pill}>
              <option value="">Dosyalanmamış</option>
              {lists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </span>

          {place.next_follow_up_at && (
            <span className={`inline-flex items-center gap-1 text-2xs font-medium ${overdue ? "text-critical" : "text-ink-3"}`}>
              <CalendarClock size={11} aria-hidden="true" />
              Takip {formatDay(place.next_follow_up_at)}
              {overdue && " · gecikti"}
            </span>
          )}
          {place.last_contact_at && <span className="text-2xs text-ink-4">Son temas {formatDay(place.last_contact_at)}</span>}
          <span className="mono-label tabular">
            {dateFormat.format(new Date(place.created_at))}
            {place.saved_by ? ` · ${place.saved_by}` : ""}
          </span>
          {place.assigned_by && place.assigned_to && (
            <span className="text-2xs text-ink-4">
              {place.assigned_by} atadı{place.assigned_at ? ` · ${dateFormat.format(new Date(place.assigned_at))}` : ""}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-start gap-2">
          <label className="sr-only" htmlFor={`note-${place.id}`}>
            {place.name ?? "Yer"} için not
          </label>
          {/* Cok satirli: Enter kaydeder, Shift+Enter yeni satir. */}
          <textarea
            id={`note-${place.id}`}
            rows={Math.min(4, Math.max(1, note.split("\n").length))}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                commit();
              }
            }}
            maxLength={2000}
            placeholder="Kalıcı not — yetkili kişi, dahili numara, dikkat edilecekler"
            className="w-full resize-none rounded-input border border-transparent bg-paper-2 px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-4 transition-colors duration-fast ease-out hover:border-rule-2 focus:border-accent focus:bg-paper"
          />
          {dirty && !saving && !saved && <span className="mt-1.5 shrink-0 text-2xs text-ink-4">Enter ile kaydet</span>}
          {saving && <span className="mt-1.5 shrink-0 text-2xs text-ink-4">Kaydediliyor…</span>}
          {saved && (
            <span role="status" className="mt-1 inline-flex shrink-0 items-center gap-1 text-2xs text-positive">
              <Check size={11} aria-hidden="true" />
              Kaydedildi
            </span>
          )}
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setContactOpen((open) => !open)}
            aria-expanded={contactOpen}
            className={`btn px-2.5 py-1.5 text-2xs ${contactOpen ? "btn--primary" : "btn--ghost"}`}
          >
            <MessageSquarePlus size={12} aria-hidden="true" />
            Temas ekle
          </button>
          <button
            type="button"
            onClick={() => {
              if (!historyVisible && history === null) loadHistory();
              setHistoryVisible((visible) => !visible);
            }}
            aria-expanded={historyVisible}
            className="btn btn--ghost px-2.5 py-1.5 text-2xs"
          >
            <History size={12} aria-hidden="true" />
            {historyVisible ? "Geçmişi gizle" : history ? `Geçmiş (${history.length})` : "Geçmişi göster"}
          </button>
        </div>

        {contactOpen && <ContactForm initialStatus={place.contact_status} onSubmit={submitContact} onCancel={() => setContactOpen(false)} />}
        {historyVisible && historyLoading && <p className="mono-label mt-3">Geçmiş yükleniyor</p>}
        {historyVisible && historyError && <p className="mt-3 text-2xs text-critical">{historyError}</p>}
        {historyVisible && !historyLoading && history && <ContactHistory items={history} />}
      </div>
    </li>
  );
}

export default React.memo(SavedPlaceRow);
