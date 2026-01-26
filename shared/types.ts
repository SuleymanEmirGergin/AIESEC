/**
 * OSM POI Bulucu - Ortak Tip Tanımlamaları
 */

export type PlaceCategory = 
  | 'factory' 
  | 'kindergarten' 
  | 'middle_school' 
  | 'high_school' 
  | 'college_university';

export interface OSMElement {
  id: string; // osm:node:123
  type: PlaceCategory;
  name: string | null;
  lat: number;
  lon: number;
  address?: string;
  distance?: number; // Metre cinsinden
  confidence: number; // 0-100
  confidence_level: 'low' | 'medium' | 'high';
  tags: Record<string, string>;
}

export interface SearchParams {
  lat: number;
  lon: number;
  radius: number;
  type: PlaceCategory;
  limit?: number;
  offset?: number;
}

export interface SearchResponse {
  results: OSMElement[];
  count: number;
  query: SearchParams;
}

export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  factory: 'Fabrika / Sanayi',
  kindergarten: 'Anaokulu / Kreş',
  middle_school: 'Ortaokul',
  high_school: 'Lise',
  college_university: 'Üniversite / Kampüs'
};

export const CATEGORY_ICONS: Record<PlaceCategory, string> = {
  factory: 'factory',
  kindergarten: 'baby',
  middle_school: 'school',
  high_school: 'graduation-cap',
  college_university: 'library'
};
