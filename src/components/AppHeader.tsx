"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound } from "lucide-react";
import type { AccountInfo } from "../lib/api";

interface AppHeaderProps {
  account: AccountInfo | null;
  onOpenSettings: () => void;
  /** Kayitli yer sayisi; verilmezse rozet gosterilmez. */
  savedCount?: number | null;
}

const PLAN_LABELS: Record<string, string> = {
  free: "Ücretsiz",
  pro: "Pro",
  enterprise: "Enterprise",
};

/**
 * Sayfalarin paylastigi baslik seridi.
 *
 * DESIGN.md sayfalarin logotype ve baslik yapisini paylasmasini zorunlu
 * tutuyor; onceden bu serit page.tsx'in icine gomuluydu ve ikinci bir
 * sayfa eklenince kopyalanmasi gerekecekti.
 *
 * Gezinme burada dogdu: uygulamanin iki yuzeyi var (harita ve kayitlilar)
 * ve aralarinda gecis yolu yoktu.
 */
export default function AppHeader({
  account,
  onOpenSettings,
  savedCount,
}: AppHeaderProps) {
  const pathname = usePathname();

  const navLink = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-input px-2.5 py-1.5 text-xs font-medium transition-colors duration-fast ease-out ${
      active
        ? "bg-accent-wash text-accent"
        : "text-ink-3 hover:bg-paper-2 hover:text-ink"
    }`;

  const planLabel = account ? PLAN_LABELS[account.plan] ?? account.plan : null;
  const remaining = account
    ? Math.max(0, account.daily_limit - account.used_today)
    : null;

  /**
   * Kalan hak yalnizca gercekten azaldiginda gorunuyor.
   *
   * "99.910" gibi bir sayi gonulluye hicbir sey anlatmiyor, yalnizca
   * seridi dolduruyor. Yogunluk kazanilir (PRODUCT.md ilke 4): sayi
   * ancak bir karari etkileyecek hale gelince cikar.
   */
  const showRemaining = remaining !== null && remaining < 50;

  return (
    <header className="shrink-0 rule-b bg-paper">
      <div className="flex h-14 items-center gap-2 px-4">
        <Link
          href="/"
          className="font-display text-sm font-semibold tracking-tight text-ink shrink-0"
        >
          POI Finder
        </Link>

        <nav className="ml-3 flex items-center gap-1" aria-label="Ana gezinme">
          <Link href="/" className={navLink(pathname === "/")}>
            Harita
          </Link>
          <Link href="/kayitli" className={navLink(pathname.startsWith("/kayitli"))}>
            Kayıtlı
            {typeof savedCount === "number" && savedCount > 0 && (
              <span className="tabular text-2xs text-ink-4">{savedCount}</span>
            )}
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {planLabel && (
            <span className="hidden sm:inline-flex items-center gap-2 rounded-input border border-rule px-2.5 py-1.5">
              <span className="mono-label text-ink-2">{planLabel}</span>
              {showRemaining && (
                <span className="mono-label tabular text-caution">
                  {remaining} hak kaldı
                </span>
              )}
            </span>
          )}

          <button
            type="button"
            onClick={onOpenSettings}
            className="btn btn--ghost px-2.5 py-1.5"
          >
            <KeyRound size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Erişim</span>
          </button>
        </div>
      </div>
    </header>
  );
}
