export type PlaceType =
  | "factory"
  | "office"
  | "workshop"
  | "kindergarten"
  | "primary_school"
  | "middle_school"
  | "high_school"
  | "private_school"
  | "college_keyword"
  | "college_university";

export interface Place {
  id: string;
  name: string;
  type: PlaceType;
  coordinates: {
    lat: number;
    lng: number;
  };
  address: string;
  distance_m?: number; // meters
  confidence_score?: number; // 0.0 to 1.0
  /**
   * Ham OSM etiketleri. CSV export'unda telefon/website/adres
   * sutunlari buradan uretiliyor; atilirsa export bos kolonlar dondurur.
   */
  tags?: Record<string, string>;
}

export interface SearchParams {
  type: PlaceType;
  radius: number; // meters
  lat: number;
  lng: number;
}

export interface ApiResponse {
  success: boolean;
  data: Place[];
  total: number;
}





export interface ReportData {
  placeId: string;
  placeName: string;
  currentType: PlaceType;
  correctedType: PlaceType;
  notes?: string;
  /** Backend raporu konumla birlikte kaydediyor; ikisi de zorunlu. */
  lat: number;
  lon: number;
}

export type ReportStatus = "open" | "resolved" | "ignored";

export interface AdminReport extends ReportData {
  id: string;
  created_at: string;
  status: ReportStatus;
  client_info?: string;
  admin_notes?: string;
  tags?: string[];
  applied_override?: boolean;
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface AdminOverride {
  id: string;
  place_id: string;
  forced_type: PlaceType;
  forced_subtype?: string;
  notes?: string;
  is_active: boolean;
  created_at: string;
}

export interface AdminStats {
  last_7_days: number;
  last_30_days: number;
  top_reported_places: { place_id: string; name: string; count: number }[];
}
