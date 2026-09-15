"""
Hizmet taksonomisi: otel, sirket, holding, emlak ofisi, dil kursu,
seyahat acentesi.

Overture'da bu kategoriler bol (Kadikoy-Atasehir bbox: 586 hotel,
878 real_estate, 602 travel_services) ama taksonomide karsiligi yoktu;
kayitlar hic cekilmiyordu. `corporate_office` Ofis'ten Sirket'e tasindi:
Ofis yalnizca serbest meslek burosu (professional_services) kaldi.
"""

import asyncio

import pytest

from app.classify import classify_service_type
from app.ingest import classify_element
from app.models import RADIUS_PRESETS
from app.overture import classify_overture
from app.queries import ALL_TYPES
from app.routers.export import TYPE_LABELS
from app.routers.presets import get_search_presets

SERVICE_TYPES = {
    "hotel",
    "company",
    "holding",
    "real_estate",
    "language_school",
    "travel_agency",
}


class TestOsmServiceClassification:
    @pytest.mark.parametrize(
        "tags, expected",
        [
            ({"tourism": "hotel"}, "hotel"),
            ({"tourism": "hostel"}, "hotel"),
            ({"tourism": "guest_house"}, "hotel"),
            ({"office": "company"}, "company"),
            ({"office": "it"}, "company"),
            ({"office": "estate_agent"}, "real_estate"),
            ({"amenity": "language_school"}, "language_school"),
            ({"office": "travel_agent"}, "travel_agency"),
            ({"shop": "travel_agency"}, "travel_agency"),
        ],
    )
    def test_tag_maps_to_service_type(self, tags, expected):
        assert classify_service_type(tags, "Ornek") == expected

    def test_holding_is_a_name_rule(self):
        """Overture'da da OSM'de de holding kategorisi yok; ad belirler."""
        assert classify_service_type({"office": "company"}, "Koç Holding") == "holding"
        assert classify_service_type({}, "Sabancı HOLDİNG A.Ş.") == "holding"

    def test_unrelated_tags_return_none(self):
        assert classify_service_type({"amenity": "cafe"}, "Kahve") is None
        assert classify_service_type({"office": "lawyer"}, "Avukat") is None

    def test_ingest_prefers_service_over_generic_office(self):
        """
        office=estate_agent daha once `["office"]` secicisinden gelip
        Ofis'e dusuyordu; simdi Emlak Ofisi olmali.
        """
        assert classify_element({"office": "estate_agent", "name": "X Emlak"}, "node") == "real_estate"
        assert classify_element({"office": "lawyer", "name": "Y Hukuk"}, "node") == "office"
        assert classify_element({"amenity": "school", "name": "Z Lisesi"}, "node") == "high_school"


class TestOvertureClassification:
    @pytest.mark.parametrize(
        "category, expected",
        [
            ("hotel", "hotel"),
            ("accommodation", "hotel"),
            ("corporate_office", "company"),
            ("information_technology_company", "company"),
            ("ferry_boat_company", "company"),
            ("professional_services", "office"),
            ("real_estate_agent", "real_estate"),
            ("language_school", "language_school"),
            ("travel_services", "travel_agency"),
            ("factory", "factory"),
            ("cafe", None),
        ],
    )
    def test_category_maps(self, category, expected):
        assert classify_overture(category, "Ornek") == expected

    def test_holding_name_wins_over_category(self):
        assert classify_overture("corporate_office", "Doğan Holding") == "holding"
        assert classify_overture("cafe", "Bir Holding") == "holding"


class TestTaxonomyLists:
    """Tur listeleri ayrisirsa arayuz chip'i "sayi yok" gosterir."""

    def test_all_types_has_16(self):
        assert len(ALL_TYPES) == 16
        assert SERVICE_TYPES <= set(ALL_TYPES)

    def test_every_type_has_radius_label_and_group(self):
        presets = asyncio.run(get_search_presets())
        grouped = {t for g in presets.type_groups_tr for t in g["types"]}
        for t in ALL_TYPES:
            assert t in RADIUS_PRESETS, t
            assert t in TYPE_LABELS, t
            assert t in presets.type_labels_tr, t
            assert t in grouped, t
