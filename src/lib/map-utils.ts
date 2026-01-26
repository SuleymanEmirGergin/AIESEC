import L from "leaflet";
import type { PlaceType } from "./types";

// Color mapping for different place types
const TYPE_COLORS: Record<PlaceType, string> = {
  factory: "#EF4444", // red
  office: "#3B82F6", // blue
  workshop: "#F59E0B", // amber
  kindergarten: "#EC4899", // pink
  primary_school: "#8B5CF6", // purple
  middle_school: "#06B6D4", // cyan
  high_school: "#10B981", // green
  private_school: "#F97316", // orange
  college_keyword: "#6366F1", // indigo
};

export function createCustomIcon(type: PlaceType): L.DivIcon {
  const color = TYPE_COLORS[type];
  
  return L.divIcon({
    className: "custom-marker",
    html: `
      <div style="
        background-color: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      ">
        <div style="
          width: 8px;
          height: 8px;
          background-color: white;
          border-radius: 50%;
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%) rotate(45deg);
        "></div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}
