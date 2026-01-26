"use client";

import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import type { Place } from "../lib/types";

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
    <div className="w-full h-full relative rounded-2xl overflow-hidden shadow-inner bg-slate-100">
      <MapContainer
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
              <Popup>
                <div className="p-1">
                  <h3 className="font-bold text-slate-900">{place.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">{place.address}</p>
                  <div className="mt-2 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                    {place.type}
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
