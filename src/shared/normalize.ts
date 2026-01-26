import { OverpassElement, OverpassResponse, Place, CategoryType, OsmType } from './types';

/**
 * OSM etiketlerinden birleştirilmiş bir adres dizesi oluşturur.
 */
function buildAddress(tags: OverpassElement['tags']): string | undefined {
  if (!tags) return undefined;

  const parts = [
    tags['addr:street'],
    tags['addr:housenumber'],
    tags['addr:district'] || tags['addr:suburb'],
    tags['addr:city'],
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(', ') : undefined;
}

/**
 * OSM etiketlerinden isim için uygun bir değer döner.
 */
function resolveName(tags: OverpassElement['tags']): string {
  if (!tags) return 'Unnamed';
  
  return (
    tags.name || 
    tags['name:tr'] || 
    tags.brand || 
    tags.amenity || 
    'Unnamed'
  );
}

/**
 * Tek bir Overpass elementini Place objesine dönüştürür.
 */
export function normalizeOsmElement(
  element: OverpassElement, 
  category: CategoryType
): Place | null {
  const lat = element.lat || element.center?.lat;
  const lon = element.lon || element.center?.lon;

  if (lat === undefined || lon === undefined) {
    return null;
  }

  return {
    id: `${element.type}/${element.id}`,
    osmType: element.type,
    lat,
    lon,
    name: resolveName(element.tags),
    category,
    address: buildAddress(element.tags),
    tags: element.tags,
    source: 'overpass',
  };
}

/**
 * Tüm Overpass yanıtını normalize eder.
 */
export function normalizeOsmResponse(
  response: OverpassResponse | any, 
  category: CategoryType
): Place[] {
  const elements = response.elements || [];
  
  return elements
    .map((el: OverpassElement) => normalizeOsmElement(el, category))
    .filter((p: Place | null): p is Place => p !== null);
}
