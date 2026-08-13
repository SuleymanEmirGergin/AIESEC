import type { Place, PlaceType } from "./types";

/**
 * Overpass API'den gelen elementleri (node, way, relation) 
 * uygulama içi 'Place' formatına dönüştürür.
 */
export function normalizeOverpassElement(element: any, type: PlaceType): Place {
  const tags = element.tags || {};
  
  // Koordinatları belirle (node ise direk, way/relation ise center)
  const lat = element.lat || element.center?.lat;
  const lng = element.lon || element.center?.lon;

  // Adres oluşturma (house number, street, city)
  const addressParts = [
    tags["addr:street"],
    tags["addr:housenumber"],
    tags["addr:suburb"] || tags["addr:district"],
    tags["addr:city"],
  ].filter(Boolean);

  return {
    id: `${element.type}/${element.id}`,
    name: tags.name || tags.operator || "İsimsiz Yer",
    type: type,
    coordinates: {
      lat: Number(lat),
      lng: Number(lng),
    },
    address: addressParts.join(", ") || "Adres bilgisi yok",
    // CSV export'u telefon/website/adres kolonlarini bu etiketlerden uretiyor.
    tags,
  };
}
