"use client";

import { memo, useEffect, useRef, useState } from "react";
// MapContainer >= 5.0.0 olmali: 4.2.1 StrictMode'da ayni dugume ikinci harita
// kurup "Map container is already initialized" firlatiyordu (kurulum muhafizi
// bayat closure okuyordu). 5.0.0 muhafizi ref'ten okuyor.
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import ContactLinks from "./ContactLinks";
import { createSpringGroup, type SpringGroup } from "../lib/spring";
import type { Place } from "../lib/types";
import { PLACE_TYPE_LABELS } from "../lib/labels";

// Leaflet default icon fix
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Bir yer secildiginde yaklasilan zoom.
const TARGET_ZOOM = 16;

interface MapViewProps {
  places: Place[];
  center: [number, number];
  zoom: number;
  onBoundsChange: (bbox: [number, number, number, number]) => void;
  selectedPlaceId?: string;
}

// Map events and flyTo handler
function MapController({
  onBoundsChange,
  places,
  selectedPlaceId
}: {
  onBoundsChange: (bbox: [number, number, number, number]) => void;
  places: Place[];
  selectedPlaceId?: string;
}) {
  const map = useMap();

  // Yay her karede setView cagiriyor; Leaflet bunun icin senkron olarak
  // zoomstart/moveend firlatiyor. Bayrak yalnizca o cagrinin suresince acik,
  // yani haritanin kendi hareketini kullanicininkinden ayirt edebiliyoruz.
  // Oturma karesinde bilerek kapali birakiliyor: son moveend gecmeli ki
  // sinirlar bir kez, hareket bittikten sonra yayinlansin.
  const selfDriven = useRef(false);

  useEffect(() => {
    const handleMove = () => {
      if (selfDriven.current) return;
      const bounds = map.getBounds();
      onBoundsChange([
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ]);
    };

    map.on("moveend", handleMove);
    handleMove(); // Initial bounds

    return () => {
      map.off("moveend", handleMove);
    };
  }, [map, onBoundsChange]);

  // Secili yere yaylanarak git.
  //
  // Leaflet'in flyTo'su yerine yay kullaniliyor: flyTo sabit sureli ve
  // kesilemez. Kullanici ucus ortasinda listeden baska bir yer secerse
  // Leaflet mevcut hareketi sert kesip yenisini sifirdan baslatiyor; hiz
  // kopuyor ve gecis "duvara carpiyor". Yayda hedef degisimi hizi tasiyarak
  // devam ettigi icin ikinci secim ilkinin uzerine akiyor.
  const springRef = useRef<SpringGroup | null>(null);

  useEffect(() => {
    if (!selectedPlaceId) return;

    const place = places.find((p) => p.id === selectedPlaceId);
    if (!place) return;

    const target = [place.coordinates.lat, place.coordinates.lng, TARGET_ZOOM];

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      map.setView([target[0], target[1]], target[2], { animate: false });
      return;
    }

    const live = () => {
      const c = map.getCenter();
      return [c.lat, c.lng, map.getZoom()];
    };

    if (!springRef.current) {
      springRef.current = createSpringGroup(
        live(),
        ([lat, lng, z], settled) => {
          selfDriven.current = !settled;
          map.setView([lat, lng], z, { animate: false });
          selfDriven.current = false;
        },
        // Yeniden konumlandirma: kritik sonumlu. Kullanici bir sey firlatmadi,
        // listeden secti - hedefi asmak burada yanlis hissettiriyor.
        { damping: 1, response: 0.4, precision: [1e-5, 1e-5, 1e-3] },
      );
    } else if (!springRef.current.running) {
      // Bosta gecen surede kullanici haritayi elle kaydirmis olabilir.
      // Yeni hareket hedef degerden degil, EKRANDAKI degerden baslamali.
      springRef.current.reset(live());
    }

    springRef.current.setTarget(target);
  }, [selectedPlaceId, places, map]);

  // Kullanici haritaya dokundugu an kontrol ona gecer - ucus ortasinda bile.
  useEffect(() => {
    const yieldToUser = () => {
      if (selfDriven.current) return;
      springRef.current?.stop();
    };

    map.on("dragstart", yieldToUser);
    map.on("zoomstart", yieldToUser);

    return () => {
      map.off("dragstart", yieldToUser);
      map.off("zoomstart", yieldToUser);
      springRef.current?.stop();
    };
  }, [map]);

  return null;
}

// memo: kaydetme gibi harita disi her state degisikligi 250 isaretci ve
// kume yapisini bastan kuruyordu (tiklama basina ~500 ms).
export default memo(MapView);

function MapView({
  places,
  center,
  zoom,
  onBoundsChange,
  selectedPlaceId
}: MapViewProps) {
  const [tileUrl, setTileUrl] = useState("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");

  return (
    // Golge yok: derinlik hairline'dan geliyor. Harita zaten yogun bir
    // yuzey; ustune ic golge koymak kenarlari bulaniklastiriyordu.
    <div className="w-full h-full relative overflow-hidden bg-paper-3">
      <MapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full z-0"
        scrollWheelZoom={true}
        // Yay kesirli zoom uretiyor; snap acik kalirsa her kare tam sayiya
        // yuvarlanip zoom basamak basamak zipliyor.
        zoomSnap={0}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url={tileUrl}
          eventHandlers={{
            tileerror: () => {
              console.warn("Primary tile provider failed, switching to backup...");
              setTileUrl("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png");
            }
          }}
        />

        <MarkerClusterGroup
          chunkedLoading
        >
          {places.map((place) => (
            <Marker 
              key={place.id} 
              position={[place.coordinates.lat, place.coordinates.lng]}
            >
              <Popup minWidth={230} maxWidth={300}>
                {/* Popup Leaflet'in kendi DOM'unda yasiyor; Tailwind
                    siniflari gecerli ama prose stilleri gecmiyor.
                    Balonun kabugu (yaricap, hairline, golge) globals.css
                    icindeki .leaflet-popup-* kurallarindan geliyor. */}
                <div className="space-y-2.5">
                  <div>
                    <h3 className="font-display text-sm font-semibold text-ink leading-snug">
                      {place.name}
                    </h3>
                    {place.address && place.address !== "Adres bilgisi yok" && (
                      <p className="mt-1 text-2xs text-ink-3">{place.address}</p>
                    )}
                  </div>

                  <div className="rule-t pt-2.5">
                    <ContactLinks
                      tags={place.tags}
                      variant="popup"
                      emptyLabel="Bu kayıt için iletişim bilgisi girilmemiş."
                    />
                  </div>

                  <div className="rule-t pt-2 flex items-center gap-2">
                    <span className="mono-label">
                      {PLACE_TYPE_LABELS[place.type] ?? place.type}
                    </span>
                    <span className="mono-label tabular ml-auto">
                      {place.coordinates.lat.toFixed(4)}, {place.coordinates.lng.toFixed(4)}
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>

        <MapController 
          onBoundsChange={onBoundsChange} 
          places={places} 
          selectedPlaceId={selectedPlaceId}
        />
      </MapContainer>
    </div>
  );
}
