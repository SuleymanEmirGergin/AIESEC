import type { PlaceType } from "./types";

/**
 * Recommended default radius (meters) for each place type.
 */
export const DEFAULT_RADIUS_BY_TYPE: Record<PlaceType, number> = {
  factory: 5000,
  office: 3000,
  workshop: 3000,
  kindergarten: 1500,
  primary_school: 1500,
  middle_school: 1500,
  high_school: 2000,
  private_school: 5000,
  college_keyword: 5000,
  // Universiteler seyrek dagiliyor; backend RADIUS_PRESETS ile ayni deger.
  college_university: 5000,
  hotel: 3000,
  company: 3000,
  holding: 5000,
  real_estate: 2000,
  language_school: 2000,
  travel_agency: 2000,
  zoo_aquarium: 5000,
  theme_park: 5000,
  museum: 3000,
  botanical_garden: 5000,
  nature_park: 5000,
};

/**
 * Available radius options for the selector.
 */
export const RADIUS_OPTIONS = [
  { value: 500, label: "500 m" },
  { value: 1000, label: "1 km" },
  { value: 1500, label: "1.5 km" },
  { value: 2000, label: "2 km" },
  { value: 3000, label: "3 km" },
  { value: 5000, label: "5 km" },
  { value: 7500, label: "7.5 km" },
  { value: 10000, label: "10 km" },
] as const;
