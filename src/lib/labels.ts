import { PlaceType } from "./types";

export const PLACE_TYPE_LABELS: Record<PlaceType, string> = {
  factory: "Fabrika",
  office: "Ofis",
  workshop: "Atölye",
  kindergarten: "Anaokulu",
  primary_school: "İlkokul",
  middle_school: "Ortaokul",
  high_school: "Lise",
  private_school: "Özel Okul",
  // "Üniversite" etiketi yanlislikla college_keyword'e bagliydi: kullanici
  // Universite'ye basinca sorgu amenity=school cekiyor, siniflandirma da
  // bu turu universiteler icin hic uretmiyordu. Turkiye'de "kolej"
  // cogunlukla ozel bir K-12 okulu demek; ikisi ayri tur.
  college_keyword: "Kolej",
  college_university: "Üniversite",
};

export const PLACE_TYPE_GROUPS: Record<string, PlaceType[]> = {
  "İşletmeler": ["factory", "office", "workshop"],
  "Eğitim Kurumları": [
    "kindergarten", 
    "primary_school",
    "middle_school", 
    "high_school", 
    "private_school",
    "college_keyword",
    "college_university"
  ],
};
