export type OsmType = 'node' | 'way' | 'relation';

export interface OverpassTags {
  name?: string;
  'name:tr'?: string;
  brand?: string;
  amenity?: string;
  'addr:street'?: string;
  'addr:housenumber'?: string;
  'addr:city'?: string;
  'addr:district'?: string;
  'addr:suburb'?: string;
  'addr:postcode'?: string;
  website?: string;
  phone?: string;
  description?: string;
  man_made?: string;
  industrial?: string;
  school?: string;
  'isced:level'?: string;
  'school:level'?: string;
  [key: string]: string | undefined;
}

export interface OverpassElement {
  type: OsmType;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: OverpassTags;
}

export interface OverpassResponse {
  version: number;
  generator: string;
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: OverpassElement[];
}

export type CategoryType = 'factory' | 'kindergarten' | 'middle_school' | 'high_school' | 'college';

export interface Place {
  id: string; // ${type}/${id}
  osmType: OsmType;
  lat: number;
  lon: number;
  name: string;
  category: CategoryType;
  address?: string;
  tags?: Partial<OverpassTags>;
  source: 'overpass';
}

export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface SearchRequest {
  bbox: BoundingBox;
  category: CategoryType;
  query?: string;
  limit?: number;
}

export interface SearchResponse {
  places: Place[];
  meta: {
    cached: boolean;
    provider: 'overpass';
    tookMs: number;
    count: number;
  };
}
