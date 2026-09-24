"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDistrictPlaces,
  fetchDistrictSummary,
  type DistrictPlace,
  type DistrictSummary,
  type PlaceQuery,
} from "@/lib/districts";

/**
 * Secili ilcenin sonuclari ve tur sayimlari.
 *
 * Sorgular yerel SQLite'a gittigi icin debounce YOK: filtre degisimi
 * aninda yansiyor. Overpass yolundaki 500 ms gecikme oradaki ag
 * maliyeti icindi, burada karsiligi yok.
 */

interface State {
  places: DistrictPlace[];
  total: number;
  summary: DistrictSummary | null;
  loading: boolean;
  error: string | null;
}

const EMPTY: State = {
  places: [],
  total: 0,
  summary: null,
  loading: false,
  error: null,
};

export function useDistrictPlaces(
  districtId: string | null,
  query: PlaceQuery
) {
  const [state, setState] = useState<State>(EMPTY);

  // Her cagriya ait controller yerelde tutuluyor: iptal edilen eski bir
  // istek, kendisinden sonra baslayan sorgunun state'ini ezmemeli.
  const activeRef = useRef<AbortController | null>(null);

  // Nesne kimligi her render'da degistigi icin sorgu icerige gore
  // seri hale getiriliyor; aksi halde effect sonsuz doner.
  const querySignature = JSON.stringify(query);

  const run = useCallback(async () => {
    if (!districtId) {
      setState(EMPTY);
      return;
    }

    activeRef.current?.abort();
    const controller = new AbortController();
    activeRef.current = controller;
    const isCurrent = () => activeRef.current === controller;

    setState((prev) => ({ ...prev, loading: true, error: null }));

    const parsed: PlaceQuery = JSON.parse(querySignature);

    try {
      // Sayimlar tampon ayarindan etkileniyor; iki istek ayni anda gidiyor.
      const [result, summary] = await Promise.all([
        fetchDistrictPlaces(districtId, parsed, controller.signal),
        fetchDistrictSummary(
          districtId,
          parsed.includeBuffer !== false,
          controller.signal
        ),
      ]);

      if (!isCurrent()) return;

      setState({
        places: result.results,
        total: result.total,
        summary,
        loading: false,
        error: null,
      });
    } catch (error: any) {
      // Kullanicinin yeni sorgusu iptal demek, hata degil.
      if (error?.name === "AbortError" || !isCurrent()) return;

      setState({
        ...EMPTY,
        error: error?.message || "Sonuçlar alınamadı.",
      });
    }
  }, [districtId, querySignature]);

  useEffect(() => {
    run();
    return () => activeRef.current?.abort();
  }, [run]);

  return { ...state, refetch: run };
}
