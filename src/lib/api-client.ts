import type { Place, SearchParams } from "./types";

export async function searchPlaces(
  params: SearchParams
): Promise<Place[]> {
  const queryParams = new URLSearchParams({
    type: params.type,
    radius: params.radius.toString(),
    lat: params.lat.toString(),
    lng: params.lng.toString(),
  });

  const response = await fetch(`/api/search?${queryParams.toString()}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "API request failed" }));
    throw new Error(error.message || "Failed to fetch places");
  }

  const data = await response.json();
  return data.data || [];
}
