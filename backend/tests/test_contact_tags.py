"""
Iletisim etiketlerinin sonuca ve CSV'ye tasinmasi.

OSM ayni bilgiyi iki semayla tutuyor: duz (`phone`, `email`) ve `contact:`
onekli. Etiket beyaz listesi duz `email`i icermiyordu, dolayisiyla yalnizca
`email` tasiyan kayitlarin iletisim bilgisi backend'den hic cikmiyordu.
"""

import csv
import io

from app.models import TAG_WHITELIST, Place
from app.routers.export import build_csv


def _element(tags: dict, osm_id: int = 1) -> dict:
    return {"type": "node", "id": osm_id, "lat": 41.0, "lon": 29.0, "tags": tags}


class TestTagWhitelist:
    def test_plain_email_survives_filtering(self):
        """`email` beyaz listede yoktu; kayit arayuze e-postasiz gidiyordu."""
        place = Place.from_osm_element(
            element=_element({"name": "Test Fabrika", "email": "info@ornek.com"}),
            place_type="factory",
            search_lat=41.0,
            search_lon=29.0,
        )
        assert place.tags.get("email") == "info@ornek.com"

    def test_prefixed_contact_tags_survive_filtering(self):
        place = Place.from_osm_element(
            element=_element(
                {
                    "name": "Test Ofis",
                    "contact:phone": "+90 212 000 00 00",
                    "contact:website": "https://ornek.com",
                }
            ),
            place_type="office",
            search_lat=41.0,
            search_lon=29.0,
        )
        assert place.tags.get("contact:phone") == "+90 212 000 00 00"
        assert place.tags.get("contact:website") == "https://ornek.com"

    def test_noise_tags_are_still_dropped(self):
        """Beyaz liste hala is goruyor olmali; yuk azaltmanin sebebi buydu."""
        place = Place.from_osm_element(
            element=_element({"name": "Test", "source": "survey", "wikidata": "Q1"}),
            place_type="factory",
            search_lat=41.0,
            search_lon=29.0,
        )
        assert "source" not in place.tags
        assert "wikidata" not in place.tags

    def test_whitelist_covers_plain_contact_keys(self):
        for key in ("phone", "email", "mobile", "fax", "website"):
            assert key in TAG_WHITELIST, f"{key} beyaz listede olmali"


class TestExportCsv:
    def _rows(self, items):
        return list(csv.reader(io.StringIO(build_csv(items))))

    def test_email_column_exists(self):
        header = self._rows([])[0]
        assert "email" in header
        assert header.index("email") == header.index("phone") + 1

    def test_prefers_plain_tag_over_prefixed(self):
        """
        Ayni yerde iki sema birden dolu olabiliyor. Oncelik sirasi
        arayuzdeki src/lib/contact.ts ile ayni olmali; yoksa kullanici
        ekranda gordugu numarayi CSV'de bulamaz.
        """
        rows = self._rows(
            [
                {
                    "id": "osm:node:1",
                    "name": "Cift Kayit",
                    "type": "office",
                    "lat": 41.0,
                    "lon": 29.0,
                    "tags": {
                        "phone": "+90 212 111 11 11",
                        "contact:phone": "+90 212 222 22 22",
                    },
                }
            ]
        )
        header, row = rows[0], rows[1]
        assert row[header.index("phone")] == "+90 212 111 11 11"

    def test_falls_back_to_prefixed_scheme(self):
        rows = self._rows(
            [
                {
                    "id": "osm:node:2",
                    "name": "Onekli Kayit",
                    "type": "office",
                    "lat": 41.0,
                    "lon": 29.0,
                    "tags": {
                        "contact:phone": "+90 212 333 33 33",
                        "contact:email": "bilgi@ornek.com",
                        "contact:website": "https://ornek.com",
                    },
                }
            ]
        )
        header, row = rows[0], rows[1]
        assert row[header.index("phone")] == "+90 212 333 33 33"
        assert row[header.index("email")] == "bilgi@ornek.com"
        assert row[header.index("website")] == "https://ornek.com"

    def test_missing_tags_produce_empty_cells_not_crash(self):
        rows = self._rows(
            [
                {
                    "id": "osm:node:3",
                    "name": "Bos",
                    "type": "factory",
                    "lat": 41.0,
                    "lon": 29.0,
                }
            ]
        )
        header, row = rows[0], rows[1]
        assert row[header.index("phone")] == ""
        assert row[header.index("email")] == ""
