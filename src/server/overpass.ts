import type { PlaceType } from "../lib/types";
import { circuitBreaker } from "./circuitBreaker";
import { snapBBoxToGrid } from "./gridSnap";

const OVERPASS_URL = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";

/**
 * Kategoriye göre OSM etiket haritası
 */
const CATEGORY_TAGS: Record<PlaceType, string> = {
  factory: '["industrial"="factory"]',
  office: '["office"]',
  workshop: '["industrial"="workshop"]',
  kindergarten: '["amenity"="kindergarten"]',
  primary_school: '["amenity"="school"]["isced:level"="1"]',
  middle_school: '["amenity"="school"]["isced:level"="2"]',
  high_school: '["amenity"="school"]["isced:level"="3"]',
  private_school: '["amenity"="school"]["operator:type"="private"]',
  college_keyword: '["amenity"~"college|university"]',
};

export async function fetchOverpass(
  bbox: [number, number, number, number], 
  category: PlaceType,
  limit: number = 100
): Promise<any> {
  // 1. Circuit Breaker Check
  if (circuitBreaker.isOpen()) {
    throw new Error("CIRCUIT_OPEN: Overpass API is temporarily throttled due to high error rate.");
  }

  // 2. Grid Snapping for BBox
  const snappedBBox = snapBBoxToGrid(bbox);
  const [minLon, minLat, maxLon, maxLat] = snappedBBox;
  
  const tags = CATEGORY_TAGS[category] || '["amenity"]';
  
  const query = `
    [out:json][timeout:15];
    (
      node${tags}(${minLat},${minLon},${maxLat},${maxLon});
      way${tags}(${minLat},${minLon},${maxLat},${maxLon});
      relation${tags}(${minLat},${minLon},${maxLat},${maxLon});
    );
    out center ${limit};
  `.trim();

  try {
    const response = await fetch(OVERPASS_URL, {
      method: "POST",
      body: `data=${encodeURIComponent(query)}`,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!response.ok) {
      circuitBreaker.recordFailure();
      const text = await response.text();
      throw new Error(`Overpass API error: ${response.status} - ${text}`);
    }

    circuitBreaker.recordSuccess();
    return response.json();
  } catch (err) {
    circuitBreaker.recordFailure();
    throw err;
  }
}
