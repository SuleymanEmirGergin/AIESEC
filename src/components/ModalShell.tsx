"use client";

import React, { useCallback, useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

interface ModalShellProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** Baslik altindaki kucuk versal etiket. */
  eyebrow?: string;
  /** Tailwind genislik sinifi; varsayilan orta boy. */
  widthClass?: string;
  children: React.ReactNode;
}

/**
 * Uc modalin (rapor, ayarlar, yukseltme) ortak kabugu.
 *
 * Onceden her biri kendi backdrop'unu, kendi kapatma butonunu ve kendi
 * z-index'ini tasiyordu; ucunde de Escape tusu calismiyor, odak arka
 * plandaki sayfada dolasmaya devam ediyordu. Klavye kullanicisi modal
 * acikken haritayi ve liste satirlarini sekmeyle geziyordu.
 *
 * Burada toplananlar:
 *  - Escape ile kapatma
 *  - Odak tuzagi (Tab/Shift+Tab modal icinde donuyor)
 *  - Acilista ilk odaklanabilir ogeye odaklanma, kapanista onceki ogeye
 *    geri donme
 *  - Arka plan kaydirma kilidi
 *  - role="dialog" + aria-modal + baslikla iliski
 */
export default function ModalShell({
  isOpen,
  onClose,
  title,
  eyebrow,
  widthClass = "max-w-lg",
  children,
}: ModalShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  /** Modal acilmadan onceki odak; kapaninca buraya donuluyor. */
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // useId: sunucu ve istemcide ayni degeri uretir. Math.random ile
  // uretilen bir id iki tarafta farkli cikip hidrasyon uyusmazligi verir.
  const titleId = useId();

  const focusableSelector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)
      ).filter((el) => el.offsetParent !== null);

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      // Tab sirasini modalin icinde kapatiyoruz: son ogeden ileri gidince
      // basa, ilk ogeden geri gidince sona.
      if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;

    // Arka plan kaydirma kilidi. Modal acikken sayfayi kaydirmak,
    // kullanicinin geri dondugunde nerede kaldigini kaybetmesi demek.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", handleKeyDown);

    // Ilk odaklanabilir ogeye odaklan; yoksa panelin kendisine.
    const firstFocusable = panelRef.current?.querySelector<HTMLElement>(focusableSelector);
    (firstFocusable ?? panelRef.current)?.focus();

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4">
      {/* Backdrop: koyu murekkep, hafif bulanik. Tiklama kapatiyor ama
          aria-hidden - ekran okuyucu icin bir hedef degil. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-scrim backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative w-full ${widthClass} max-h-[calc(100vh-2rem)] overflow-y-auto rounded-card border border-rule-2 bg-paper shadow-modal outline-none`}
      >
        <div className="sticky top-0 z-10 flex items-start gap-4 rule-b bg-paper px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <p className="mono-label mb-1">{eyebrow}</p>}
            <h2
              id={titleId}
              className="font-display text-lg font-semibold text-ink leading-tight"
            >
              {title}
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

        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
