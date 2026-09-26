"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { fetchAccount, type AccountInfo } from "../lib/api";

interface AppHeaderProps {
  /** Kayitli yer sayisi; verilmezse rozet gosterilmez. */
  savedCount?: number | null;
}

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
export default function AppHeader({ savedCount }: AppHeaderProps) {
  const pathname = usePathname();
  const [account, setAccount] = useState<AccountInfo | null>(null);

  useEffect(() => {
    fetchAccount().then(setAccount);
  }, []);

  const navLink = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-input px-2.5 py-1.5 text-xs font-medium transition-colors duration-fast ease-out ${
      active
        ? "bg-accent-wash text-accent"
        : "text-ink-3 hover:bg-paper-2 hover:text-ink"
    }`;

  return (
    <header className="shrink-0 rule-b bg-paper">
      <div className="flex h-14 items-center gap-2 px-4">
        <Link
          href="/"
          className="font-display text-sm font-semibold tracking-tight text-ink shrink-0"
        >
          Rota
        </Link>

        <nav className="ml-3 flex items-center gap-1" aria-label="Ana gezinme">
          <Link href="/" className={navLink(pathname === "/")}>
            Arama
          </Link>
          <Link href="/kayitli" className={navLink(pathname.startsWith("/kayitli"))}>
            Kayıtlı
            {typeof savedCount === "number" && savedCount > 0 && (
              <span className="tabular text-2xs text-ink-4">{savedCount}</span>
            )}
          </Link>
          {account?.role === "admin" && (
            <>
              <Link href="/ekip" className={navLink(pathname.startsWith("/ekip"))}>
                Ekip
              </Link>
              <Link href="/admin" className={navLink(pathname.startsWith("/admin"))}>
                Yönetim
              </Link>
            </>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {account && (
            <span className="hidden min-w-0 text-right sm:block">
              <span className="block truncate text-xs font-medium text-ink">{account.name}</span>
              {account.name !== account.email && (
                <span className="block truncate text-2xs text-ink-4">{account.email}</span>
              )}
            </span>
          )}
          <button
            type="button"
            onClick={() => signOut({ redirectTo: "/giris" })}
            className="btn btn--ghost px-2.5 py-1.5"
          >
            <LogOut size={13} aria-hidden="true" />
            <span className="hidden sm:inline">Çıkış</span>
          </button>
        </div>
      </div>
    </header>
  );
}
