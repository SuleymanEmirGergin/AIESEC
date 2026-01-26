"use client";

import { useEffect, useRef } from "react";
import type { Place } from "@/lib/types";
import { createCustomIcon } from "@/lib/map-utils";
import { PLACE_TYPE_LABELS } from "@/lib/labels";

interface MapContainerProps {
  places: Place[];
  center: [number, number];
  zoom: number;
  onMarkerClick?: (place: Place) => void;
}

export default function MapContainer({
  places,
  center,
  zoom,
  onMarkerClick,
}: MapContainerProps) {
  const mapRef = useRef<any>(null);
  const mapInstanceRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);

  useEffect(() => {
    // Dynamically import Leaflet to avoid SSR issues
    const initMap = async () => {
      if (typeof window === "undefined") return;

      const L = await import("leaflet");

      if (!mapRef.current || mapInstanceRef.current) return;

      // Initialize map
      const map = L.map(mapRef.current).setView(center, zoom);

      // Add OSM tile layer
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update map center and zoom
  useEffect(() => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView(center, zoom);
    }
  }, [center, zoom]);

  // Update markers when places change
  useEffect(() => {
    const updateMarkers = async () => {
      if (!mapInstanceRef.current) return;

      const L = await import("leaflet");

      // Clear existing markers
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];

      // Add new markers
      places.forEach((place) => {
        const icon = createCustomIcon(place.type);
        const marker = L.marker(
          [place.coordinates.lat, place.coordinates.lng],
          { icon }
        ).addTo(mapInstanceRef.current);

        // Popup content
        const popupContent = `
          <div class="font-body">
            <h3 class="font-heading font-bold text-lg mb-1">${place.name}</h3>
            <p class="text-sm text-slate-600 mb-1">${PLACE_TYPE_LABELS[place.type]}</p>
            <p class="text-xs text-slate-500">${place.address}</p>
            ${place.distance_m ? `<p class="text-xs text-primary font-semibold mt-2">${place.distance_m < 1000 ? `${Math.round(place.distance_m)}m` : `${(place.distance_m / 1000).toFixed(1)}km`} uzaklıkta</p>` : ""}
          </div>
        `;

        marker.bindPopup(popupContent);

        marker.on("click", () => {
          if (onMarkerClick) {
            onMarkerClick(place);
          }
        });

        markersRef.current.push(marker);
      });
    };

    updateMarkers();
  }, [places, onMarkerClick]);

  return (
    <div
      ref={mapRef}
      className="w-full h-full min-h-[400px] lg:min-h-[600px] rounded-2xl shadow-lg"
      style={{ zIndex: 0 }}
    />
  );
}
