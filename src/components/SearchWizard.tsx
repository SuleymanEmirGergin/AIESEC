"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, MapPin, Search } from "lucide-react";
import {
  fetchDistrictSummary,
  fetchDistricts,
  foldTr,
  groupByProvince,
  type DistrictMeta,
} from "@/lib/districts";
import { PLACE_TYPE_GROUPS, PLACE_TYPE_LABELS } from "@/lib/labels";
import type { PlaceType } from "@/lib/types";

export interface WizardSelection {
  district: DistrictMeta;
  types: PlaceType[];
}

interface SearchWizardProps {
  /** "Aramayi degistir" ile donuldugunde onceki secim; kategori adimindan acilir. */
  initial?: WizardSelection | null;
  onConfirm: (selection: WizardSelection) => void;
  onCancel?: () => void;
}

type Step = 1 | 2 | 3;

const STEP_TITLES: Record<Step, string> = {
  1: "İl seçin",
  2: "İlçe seçin",
  3: "Kategorileri seçin",
};

/**
 * Arama sihirbazi: il -> ilce -> kategori(ler) -> onay.
 *
 * Eskiden il, ilce ve kategori ayni kenar cubugunda ayni anda duruyordu
 * ve kullanici hangisinin once secilmesi gerektigini bilemiyordu. Her
 * adim bir oncekine bagli: ilce listesi ile, kategori sayilari ilceyle
 * degisiyor. Coklu kategori secimi anlik sorgu atmiyor, "Onayla" ile
 * tek seferde taraniyor.
 */
export default function SearchWizard({ initial, onConfirm, onCancel }: SearchWizardProps) {
  const [districts, setDistricts] = useState<DistrictMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(initial ? 3 : 1);
  const [plate, setPlate] = useState<string | null>(initial?.district.province_plate ?? null);
  const [district, setDistrict] = useState<DistrictMeta | null>(initial?.district ?? null);
  const [types, setTypes] = useState<Set<PlaceType>>(new Set(initial?.types ?? []));
  const [term, setTerm] = useState("");
  const [counts, setCounts] = useState<Record<PlaceType, number> | null>(null);

  useEffect(() => {
    fetchDistricts()
      .then(setDistricts)
      .catch((e) => setError(e?.message || "İlçe listesi alınamadı."));
  }, []);

  // Kategori sayilari ilceye bagli; ilce degisince tazeleniyor.
  useEffect(() => {
    if (!district) return;
    let alive = true;
    setCounts(null);
    fetchDistrictSummary(district.id)
      .then((s) => alive && setCounts(s.counts))
      // Sayilar bir kolaylik; gelmezse cipler sayisiz calisir.
      .catch(() => alive && setCounts(null));
    return () => {
      alive = false;
    };
  }, [district]);

  const provinces = useMemo(() => groupByProvince(districts), [districts]);
  const province = provinces.find((p) => p.plate === plate) ?? null;

  const visibleDistricts = useMemo(() => {
    const needle = foldTr(term.trim());
    const pool = province?.districts ?? [];
    return needle ? pool.filter((d) => foldTr(d.name).includes(needle)) : pool;
  }, [province, term]);

  const allTypes = useMemo(() => Object.values(PLACE_TYPE_GROUPS).flat(), []);
  // Kaydi olmayan tur secilemez: secilse bos sonuc doner ve kullanici
  // aramanin bozuk oldugunu sanar.
  const selectable = (t: PlaceType) => !counts || (counts[t] ?? 0) > 0;
  const expected = counts ? [...types].reduce((sum, t) => sum + (counts[t] ?? 0), 0) : null;

  const toggleType = (t: PlaceType) =>
    setTypes((prev) => {
      const next = new Set(prev);
      next.has(t) ? next.delete(t) : next.add(t);
      return next;
    });

  const toggleGroup = (group: PlaceType[]) =>
    setTypes((prev) => {
      const pickable = group.filter(selectable);
      const allOn = pickable.every((t) => prev.has(t));
      const next = new Set(prev);
      pickable.forEach((t) => (allOn ? next.delete(t) : next.add(t)));
      return next;
    });

  const pickProvince = (p: string) => {
    if (p !== plate) {
      setDistrict(null);
      setTypes(new Set());
    }
    setPlate(p);
    setTerm("");
    setStep(2);
  };

  const pickDistrict = (d: DistrictMeta) => {
    if (d.id !== district?.id) setTypes(new Set());
    setDistrict(d);
    setStep(3);
  };

  const confirm = () => {
    if (!district || types.size === 0) return;
    // Sira PLACE_TYPE_GROUPS'taki gibi: basliklar ve dosya adi tutarli olsun.
    onConfirm({ district, types: allTypes.filter((t) => types.has(t)) });
  };

  if (error) {
    return (
      <p className="m-6 flex items-start gap-2 text-sm text-critical">
        <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
        {error}
      </p>
    );
  }

  const stepDone = (s: Step) =>
    s === 1 ? !!province : s === 2 ? !!district : types.size > 0;
  const stepValue = (s: Step) =>
    s === 1 ? province?.province : s === 2 ? district?.name : types.size ? `${types.size} kategori` : null;
  const canOpen = (s: Step) => s === 1 || (s === 2 && !!province) || (s === 3 && !!district);

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-4 py-6 sm:px-6">
      {/* Adim gostergesi: tamamlanan adima tiklayip geri donulebiliyor. */}
      <ol className="flex items-center gap-2" aria-label="Arama adımları">
        {([1, 2, 3] as Step[]).map((s) => {
          const active = s === step;
          return (
            <li key={s} className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => canOpen(s) && setStep(s)}
                disabled={!canOpen(s)}
                aria-current={active ? "step" : undefined}
                className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-card border px-3 py-2.5 text-left transition-colors duration-fast ease-out disabled:cursor-not-allowed ${
                  active
                    ? "border-accent bg-accent-wash"
                    : "border-rule hover:bg-paper-2 disabled:hover:bg-transparent"
                }`}
              >
                <span
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-2xs font-semibold ${
                    stepDone(s) && !active
                      ? "bg-positive text-paper"
                      : active
                        ? "bg-accent text-accent-ink"
                        : "bg-paper-3 text-ink-3"
                  }`}
                >
                  {stepDone(s) && !active ? <Check size={12} aria-hidden="true" /> : s}
                </span>
                <span className="min-w-0">
                  <span className="mono-label block">{["İl", "İlçe", "Kategori"][s - 1]}</span>
                  <span className="block truncate text-xs font-medium text-ink">
                    {stepValue(s) ?? "—"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-6 flex items-center gap-2">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((step - 1) as Step)}
            aria-label="Önceki adım"
            className="rounded-input p-1.5 text-ink-3 transition-colors duration-fast ease-out hover:bg-paper-2 hover:text-ink"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        )}
        <h1 className="font-display text-xl font-semibold text-ink">{STEP_TITLES[step]}</h1>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="btn btn--ghost ml-auto px-3 py-1.5 text-xs"
          >
            Sonuçlara dön
          </button>
        )}
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {step === 1 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {provinces.length === 0 && <p className="mono-label">Yükleniyor…</p>}
            {provinces.map((p) => (
              <button
                key={p.plate}
                type="button"
                onClick={() => pickProvince(p.plate)}
                className={`pressable rounded-card border px-4 py-4 text-left transition-colors duration-fast ease-out ${
                  plate === p.plate ? "border-accent bg-accent-wash" : "border-rule hover:border-ink-4 hover:bg-paper-2"
                }`}
              >
                <span className="block font-display text-base font-semibold text-ink">
                  {p.province}
                </span>
                <span className="mono-label tabular mt-1 block">{p.districts.length} ilçe</span>
              </button>
            ))}
          </div>
        )}

        {step === 2 && province && (
          <>
            <div className="relative max-w-sm">
              <label htmlFor="wizard-district-search" className="sr-only">
                İlçe ara
              </label>
              <Search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-4"
              />
              <input
                id="wizard-district-search"
                type="search"
                autoFocus
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder={`${province.province} ilçelerinde ara`}
                className="w-full rounded-input border border-rule-2 bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-4 hover:border-ink-4 focus:border-accent"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {visibleDistricts.map((d) => {
                const empty = d.fetched_at === null;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => pickDistrict(d)}
                    // Verisi cekilmemis ilce secilirse bos sonuc doner.
                    disabled={empty}
                    className={`flex items-center gap-2 rounded-input border px-3 py-2.5 text-left text-sm transition-colors duration-fast ease-out disabled:cursor-not-allowed disabled:opacity-40 ${
                      district?.id === d.id
                        ? "border-accent bg-accent-wash text-accent"
                        : "border-rule text-ink-2 hover:border-ink-4 hover:bg-paper-2 hover:text-ink"
                    }`}
                  >
                    <MapPin size={13} aria-hidden="true" className="shrink-0 opacity-60" />
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="tabular shrink-0 text-2xs opacity-60">
                      {empty ? "veri yok" : d.place_count ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
            {visibleDistricts.length === 0 && <p className="field-note mt-3">Eşleşen ilçe yok.</p>}
          </>
        )}

        {step === 3 && district && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setTypes(new Set(allTypes.filter(selectable)))}
                className="mono-label text-accent hover:text-accent-hover"
              >
                Tümünü seç
              </button>
              {types.size > 0 && (
                <button
                  type="button"
                  onClick={() => setTypes(new Set())}
                  className="mono-label hover:text-ink"
                >
                  Temizle
                </button>
              )}
              {!counts && <span className="mono-label">Sayılar yükleniyor…</span>}
            </div>

            {Object.entries(PLACE_TYPE_GROUPS).map(([groupName, group]) => (
              <section key={groupName}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="mono-label mb-2 block text-ink-3 transition-colors duration-fast ease-out hover:text-accent"
                >
                  {groupName}
                </button>
                <div className="flex flex-wrap gap-2">
                  {group.map((t) => {
                    const on = types.has(t);
                    const n = counts?.[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleType(t)}
                        aria-pressed={on}
                        disabled={!selectable(t)}
                        className={`inline-flex items-center gap-2 rounded-input border px-3 py-2 text-sm transition-colors duration-fast ease-out disabled:cursor-not-allowed disabled:opacity-40 ${
                          on
                            ? "border-accent bg-accent-wash text-accent"
                            : "border-rule-2 bg-paper text-ink-2 hover:border-ink-4"
                        }`}
                      >
                        {on && <Check size={13} aria-hidden="true" />}
                        <span>{PLACE_TYPE_LABELS[t]}</span>
                        {n !== undefined && <span className="tabular text-2xs text-ink-4">{n}</span>}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {step === 3 && district && (
        <div className="mt-4 flex items-center gap-3 rule-t pt-4">
          <p className="text-xs text-ink-3">
            {types.size === 0
              ? "En az bir kategori seçin."
              : `${district.name} · ${types.size} kategori${expected !== null ? ` · ${expected} kayıt` : ""}`}
          </p>
          <button
            type="button"
            onClick={confirm}
            disabled={types.size === 0}
            className="btn btn--primary ml-auto px-5 py-2.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={15} aria-hidden="true" />
            Onayla ve tara
          </button>
        </div>
      )}
    </div>
  );
}
