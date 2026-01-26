export type SearchMode = "auto" | "around" | "bbox";

export interface PresetsResponse {
  max_radius: number;
  default_by_type: Record<string, number>;
  radius_options: number[];
  default_mode: SearchMode;
  type_groups_tr?: Record<string, string[]> | { group: string; types: string[] }[];
  type_labels_tr?: Record<string, string>;
  notes?: string;
}

export type ConfigStatus = "loading" | "ready" | "fallback" | "error";
