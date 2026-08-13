"use client";

import {
  LeafletProvider,
  createLeafletContext,
  type LeafletContextInterface,
} from "@react-leaflet/core";
import {
  Map as LeafletMap,
  type FitBoundsOptions,
  type LatLngBoundsExpression,
  type MapOptions,
} from "leaflet";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ForwardedRef,
  type ReactNode,
} from "react";

/**
 * react-leaflet 4.2.1'in MapContainer'inin yerine gecen ince sarmalayici.
 *
 * NEDEN VAR: 4.2.1'in MapContainer'i haritayi bos bagimlilikli bir
 * `useCallback` ref'i icinde kuruyor ve kurulup kurulmadigini `context === null`
 * ile kontrol ediyor. O closure asla yenilenmedigi icin `context`i sonsuza
 * kadar `null` goruyor. React 18 StrictMode ref'i ikinci kez bagladiginda
 * kontrol yine "kurulmamis" diyor ve ayni DOM dugumune ikinci bir harita
 * kurulmaya calisiliyor:
 *
 *     Uncaught Error: Map container is already initialized.
 *
 * Bu yalnizca konsol gurultusu degildi: hata React'in hata sinirina kadar
 * cikip tum sayfa agacini yeniden kurduruyor, secili kategori dahil butun
 * state sifirlaniyordu.
 *
 * COZUM: Tek satirlik fark - kurulum muhafizi bayat closure degiskeni yerine
 * bir ref okuyor (`!mapInstanceRef.current`). Boylece dugume hicbir zaman
 * ikinci bir harita kurulmuyor. Bu, react-leaflet'in 5.0.0'da kendi yaptigi
 * duzeltmenin aynisi; buraya birebir geri tasindi. 5.0.0'a yukseltmek mumkun
 * degil cunku peerDependencies React 19 istiyor (proje React 18.3 + Next 14).
 * 4.2.1 de 4.x serisinin son surumu, yani arada yama surumu yok.
 *
 * Temizlik efekti bilerek 4.2.1/5.0.0 ile ayni: `[context]`e bagli ve
 * `context?.map.remove()` cagiriyor.
 *
 * DIKKAT - `mapInstanceRef` temizlikte BILEREK sifirlanmiyor. StrictMode'un
 * cift cagirdigi ilk efekt her zaman `context = null` gormus olur (context'i
 * yayan `setContext` bir sonraki commit'e dusuyor), yani o temizlik zaten
 * no-op. Buraya `mapInstanceRef.current = null` eklemek, haritayi kaldirip
 * yerine yenisini kurmayan bir yol acar ve harita bos kalir.
 */
export interface StrictModeMapContainerProps extends MapOptions {
  bounds?: LatLngBoundsExpression;
  boundsOptions?: FitBoundsOptions;
  children?: ReactNode;
  className?: string;
  id?: string;
  placeholder?: ReactNode;
  style?: CSSProperties;
  whenReady?: () => void;
}

function StrictModeMapContainerComponent(
  {
    bounds,
    boundsOptions,
    center,
    children,
    className,
    id,
    placeholder,
    style,
    whenReady,
    zoom,
    ...options
  }: StrictModeMapContainerProps,
  forwardedRef: ForwardedRef<LeafletMap | null>,
) {
  // Harita secenekleri gibi bunlar da yalnizca ilk render'da okunur.
  const [divProps] = useState({ className, id, style });
  const [context, setContext] = useState<LeafletContextInterface | null>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);

  // Harita ilk render'da henuz kurulmadigi icin handle gercekten null
  // olabiliyor; generic'ler bu yuzden acik veriliyor.
  useImperativeHandle<LeafletMap | null, LeafletMap | null>(
    forwardedRef,
    () => context?.map ?? null,
    [context],
  );

  const mapRef = useCallback((node: HTMLDivElement | null) => {
    // Muhafiz closure degil ref okuyor: StrictMode ref'i ikinci kez baglasa
    // bile ikinci harita kurulmuyor.
    if (node !== null && !mapInstanceRef.current) {
      const map = new LeafletMap(node, options);
      mapInstanceRef.current = map;

      if (center != null && zoom != null) {
        map.setView(center, zoom);
      } else if (bounds != null) {
        map.fitBounds(bounds, boundsOptions);
      }

      if (whenReady != null) {
        map.whenReady(whenReady);
      }

      setContext(createLeafletContext(map));
    }
    // Harita secenekleri kurulum aninda sabitlenir; kasitli olarak bos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      context?.map.remove();
    };
  }, [context]);

  const contents = context ? (
    <LeafletProvider value={context}>{children}</LeafletProvider>
  ) : (
    placeholder ?? null
  );

  return (
    <div {...divProps} ref={mapRef}>
      {contents}
    </div>
  );
}

export const StrictModeMapContainer = forwardRef(StrictModeMapContainerComponent);
