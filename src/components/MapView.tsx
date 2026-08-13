"use client";

import { useEffect, useState } from "react";
import { TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import ContactLinks from "./ContactLinks";
import { StrictModeMapContainer } from "./StrictModeMapContainer";
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

  useEffect(() => {
    const handleMove = () => {
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

  // Fly to selected place
  useEffect(() => {
    if (selectedPlaceId) {
      const place = places.find(p => p.id === selectedPlaceId);
      if (place) {
        map.flyTo([place.coordinates.lat, place.coordinates.lng], 16, {
          duration: 1.5
        });
      }
    }
  }, [selectedPlaceId, places, map]);

  return null;
}

export default function MapView({
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
      {/* react-leaflet'in MapContainer'i yerine kendi sarmalayicimiz:
          4.2.1'in StrictMode'da ayni dugume ikinci harita kurma hatasi
          icin bkz. StrictModeMapContainer. */}
      <StrictModeMapContainer
        center={center}
        zoom={zoom}
        className="w-full h-full z-0"
        scrollWheelZoom={true}
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
      </StrictModeMapContainer>
    </div>
  );
}
