import { CategoryType, BoundingBox } from './types';

export interface CategoryDefinition {
  id: CategoryType;
  label: string;
  overpassFilter: string;
  description: string;
}

export const CATEGORIES: Record<CategoryType, CategoryDefinition> = {
  factory: {
    id: 'factory',
    label: 'Fabrika / Sanayi',
    overpassFilter: '["man_made"="works"]',
    description: 'Büyük ölçekli üretim tesisleri ve sanayi alanları. Alternate: industrial=*',
  },
  kindergarten: {
    id: 'kindergarten',
    label: 'Anaokulu',
    overpassFilter: '["amenity"="kindergarten"]',
    description: 'Okul öncesi eğitim kurumları.',
  },
  middle_school: {
    id: 'middle_school',
    label: 'Ortaokul',
    overpassFilter: '["amenity"="school"]["isced:level"="2"]',
    description: 'ISCED seviye 2 veya ortaokul olarak etiketlenmiş okullar.',
  },
  high_school: {
    id: 'high_school',
    label: 'Lise',
    overpassFilter: '["amenity"="school"]["isced:level"="3"]',
    description: 'ISCED seviye 3 veya lise olarak etiketlenmiş okullar.',
  },
  college: {
    id: 'college',
    label: 'Üniversite / Kolej',
    overpassFilter: '["amenity"~"university|college"]',
    description: 'Yükseköğretim kurumları (university veya college).',
  },
};

/**
 * Belirli bir kategori ve koordinat alanı için Overpass QL sorgusu oluşturur.
 * OSM'deki heterojen etiketleme yapısı nedeniyle bazı filtreler genişletilmiş olabilir.
 */
export function buildOverpassQuery(category: CategoryType, bbox: BoundingBox): string {
  const { south, west, north, east } = bbox;
  const area = `(${south},${west},${north},${east})`;
  
  let filter = CATEGORIES[category].overpassFilter;
  
  // Özel durumlar için genişletilmiş filtre mantığı
  if (category === 'factory') {
    // Factory için hem works hem de industrial araması yapıyoruz
    return `
      [out:json][timeout:25];
      (
        node["man_made"="works"]${area};
        way["man_made"="works"]${area};
        relation["man_made"="works"]${area};
        node["industrial"]${area};
        way["industrial"]${area};
        relation["industrial"]${area};
      );
      out center;
    `.trim();
  }

  if (category === 'middle_school' || category === 'high_school') {
    // Okullar için ISCED seviyesi veya okul tipi kontrolü
    const level = category === 'middle_school' ? '2' : '3';
    const tagMatch = category === 'middle_school' ? 'middle' : 'high';
    
    return `
      [out:json][timeout:25];
      (
        node["amenity"="school"]["isced:level"="${level}"]${area};
        way["amenity"="school"]["isced:level"="${level}"]${area};
        relation["amenity"="school"]["isced:level"="${level}"]${area};
        node["amenity"="school"]["school:level"="${tagMatch}"]${area};
        way["amenity"="school"]["school:level"="${tagMatch}"]${area};
        relation["amenity"="school"]["school:level"="${tagMatch}"]${area};
      );
      out center;
    `.trim();
  }

  // Standart filtreler (kindergarten, college)
  return `
    [out:json][timeout:25];
    (
      node${filter}${area};
      way${filter}${area};
      relation${filter}${area};
    );
    out center;
  `.trim();
}
