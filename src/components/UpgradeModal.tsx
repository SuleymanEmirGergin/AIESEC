"use client";

import { Check, Minus } from "lucide-react";
import ModalShell from "./ModalShell";

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Plan farklari.
 *
 * Bu liste kodda GERCEKTEN plana bagli olan seylerden turetildi:
 *  - arama yaricapi  -> backend/app/routers/search.py (free 2000m, digeri 5000m)
 *  - CSV disa aktarim -> backend/app/routers/export.py (free'de 403)
 *
 * Onceki listede "Yuksek Hassasiyetli Filtreler", "Admin Paneli Erisimi",
 * "Oncelikli Destek" ve "Ozel Veri Overrides" satirlari vardi; hicbiri
 * plana bagli degil. Admin paneli ADMIN_API_KEY ile korunuyor, planla
 * ilgisi yok. "Lead Export (CSV/PDF)" ise olmayan bir PDF ciktisi vaat
 * ediyordu - export yalnizca CSV uretiyor.
 */
const PLAN_ROWS: { label: string; free: string | false; pro: string | true }[] = [
  { label: "Arama yarıçapı", free: "2 km", pro: "5 km" },
  { label: "CSV dışa aktarım", free: false, pro: true },
  { label: "Harita araması", free: "var", pro: "var" },
];

function Cell({ value }: { value: string | boolean }) {
  if (value === true) return <Check size={14} className="text-accent" aria-label="var" />;
  if (value === false)
    return <Minus size={14} className="text-ink-4" aria-label="yok" />;
  return <span className="tabular text-2xs text-ink-2">{value}</span>;
}

export default function UpgradeModal({ isOpen, onClose }: UpgradeModalProps) {
  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      eyebrow="Plan"
      title="Pro ne açıyor?"
    >
      <div className="space-y-5">
        <table className="w-full border-collapse">
          <caption className="sr-only">
            Ücretsiz ve Pro planların karşılaştırması
          </caption>
          <thead>
            <tr className="rule-b">
              <th scope="col" className="py-2 text-left mono-label font-normal">
                Özellik
              </th>
              <th scope="col" className="w-20 py-2 text-center mono-label font-normal">
                Ücretsiz
              </th>
              <th
                scope="col"
                className="w-20 py-2 text-center mono-label font-normal text-accent"
              >
                Pro
              </th>
            </tr>
          </thead>
          <tbody>
            {PLAN_ROWS.map((row) => (
              <tr key={row.label} className="rule-b last:border-b-0">
                <th
                  scope="row"
                  className="py-2.5 text-left text-xs font-normal text-ink"
                >
                  {row.label}
                </th>
                <td className="py-2.5 text-center">
                  <span className="inline-flex justify-center">
                    <Cell value={row.free} />
                  </span>
                </td>
                <td className="py-2.5 text-center">
                  <span className="inline-flex justify-center">
                    <Cell value={row.pro} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-xs leading-relaxed text-ink-3">
          Günlük istek kotası plana değil, anahtarın kendisine bağlı; mevcut
          kotanızı Ayarlar bölümünde görebilirsiniz.
        </p>

        {/*
          Dogru CTA. Uygulamada odeme entegrasyonu yok - "Hemen Yukselt"
          diyen ve hicbir sey yapmayan bir buton ile uydurma bir aylik
          fiyat vardi. Anahtarlar yonetici tarafindan uretiliyor,
          dolayisiyla gercek eylem bu.
        */}
        <div className="rounded-input border border-rule bg-paper-2 px-3 py-3">
          <p className="mono-label mb-1.5">Yükseltme</p>
          <p className="text-xs leading-relaxed text-ink-2">
            Planlar yönetici tarafından anahtar bazında ayarlanıyor. Yükseltme
            için anahtarınızın adıyla birlikte yöneticinize başvurun.
          </p>
        </div>

        <button type="button" onClick={onClose} className="btn btn--ghost w-full px-4 py-2.5">
          Kapat
        </button>
      </div>
    </ModalShell>
  );
}
