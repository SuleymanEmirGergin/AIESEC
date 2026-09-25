"use client";

import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import type { AccountInfo } from "../lib/api";
import ModalShell from "./ModalShell";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  /**
   * Bu oturumda gecerli olan hesap (kisisel anahtar ya da sunucu anahtari).
   * null ise durum okunamamis demektir.
   */
  account?: AccountInfo | null;
}

export default function SettingsModal({
  isOpen,
  onClose,
  onSaved,
  account,
}: SettingsModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [volunteerName, setVolunteerName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setApiKey(localStorage.getItem("api_key") || "");
      setVolunteerName(localStorage.getItem("volunteer_name") || "");
      setShowSuccess(false);
    }
  }, [isOpen]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    // Bos deger anahtari kaldirmak demek; bos string saklamak
    // "anahtar var ama gecersiz" durumu yaratip her istegi 401'e dusururdu.
    if (apiKey.trim()) {
      localStorage.setItem("api_key", apiKey.trim());
    } else {
      localStorage.removeItem("api_key");
    }

    if (volunteerName.trim()) {
      localStorage.setItem("volunteer_name", volunteerName.trim());
    } else {
      localStorage.removeItem("volunteer_name");
    }

    setIsSaving(false);
    setShowSuccess(true);
    onSaved();
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="Erişim"
      title="Erişim ve gönüllü adı"
    >
      <div className="space-y-6">
        <dl className="rounded-input border border-rule divide-y divide-rule">
          <div className="flex items-center gap-3 px-3 py-2.5">
            <dt className="mono-label shrink-0 w-24">Kimlik</dt>
            <dd className="text-sm text-ink">
              {account
                ? account.scope === "personal"
                  ? "Kişisel anahtarınız"
                  : "Paylaşılan sunucu anahtarı"
                : "Okunamadı"}
            </dd>
          </div>
        </dl>

        {account?.scope === "server" && (
          <p className="text-xs leading-relaxed text-ink-3">
            Şu an uygulamanın paylaşılan sunucu anahtarı kullanılıyor; arama,
            kaydetme ve indirme kişisel anahtar olmadan çalışır.
          </p>
        )}

        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-2">
            <label
              htmlFor="settings-volunteer-name"
              className="block text-xs font-medium text-ink"
            >
              Gönüllü adı{" "}
              <span className="font-normal text-ink-4">· kayıtlar için gerekli</span>
            </label>

            <input
              id="settings-volunteer-name"
              type="text"
              value={volunteerName}
              onChange={(e) => {
                setVolunteerName(e.target.value);
                setShowSuccess(false);
              }}
              placeholder="Örn. Ece"
              autoComplete="name"
              maxLength={120}
              className="w-full rounded-input border border-rule-2 bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 transition-colors duration-fast ease-out hover:border-ink-4 focus:border-accent"
            />

            <p className="text-2xs leading-relaxed text-ink-4">
              Ekip içi kayıtların kim tarafından eklendiğini gösterir; yalnızca bu
              tarayıcıda saklanır.
            </p>
          </div>

          <label htmlFor="settings-api-key" className="block text-xs font-medium text-ink">
            Kişisel API anahtarı{" "}
            <span className="font-normal text-ink-4">· isteğe bağlı</span>
          </label>

          <input
            id="settings-api-key"
            type="text"
            value={apiKey}
            onChange={(e) => {
              setApiKey(e.target.value);
              setShowSuccess(false);
            }}
            // Anahtarlar `ak_` onekiyle uretiliyor; onceki placeholder
            // `sk_...` diyordu ve yanlis bir bicim ogretiyordu.
            placeholder="ak_…"
            autoComplete="off"
            spellCheck={false}
            className="tabular w-full rounded-input border border-rule-2 bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 transition-colors duration-fast ease-out hover:border-ink-4 focus:border-accent"
          />

          <p className="text-2xs leading-relaxed text-ink-4">
            Anahtar yalnızca bu tarayıcıda saklanır. Boş bırakıp kaydederseniz
            kaldırılır ve paylaşılan sunucu anahtarına dönülür.
          </p>

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isSaving}
              className="btn btn--primary px-4 py-2.5"
            >
              {isSaving ? "Kaydediliyor…" : "Kaydet"}
            </button>

            {/* Sessiz basari: kutlama toast'i yok, sonuc butonun yaninda
                tek satirda bildiriliyor. */}
            {showSuccess && (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 text-xs text-positive"
              >
                <Check size={13} />
                Kaydedildi
              </span>
            )}
          </div>
        </form>
      </div>
    </ModalShell>
  );
}
