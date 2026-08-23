"""
Universite taksonomisi.

Universiteler iki bagimsiz sebepten hic gorunmuyordu:
  1. classify_school_level erken cikisi (amenity != "school" -> None)
     universite dalina ulasilmadan donuyordu.
  2. "Universite" etiketi frontend'de college_keyword'e bagliydi, yani
     kullanici Universite'ye basinca amenity=school sorgusu gidiyordu.

Turkiye'de "kolej" cogunlukla ozel bir K-12 okulu; universite ayri tur.
"""

from unittest.mock import patch

import pytest

from app.classify import classify_school_level
from app.models import RADIUS_PRESETS
from tests.conftest import overpass_stub

SEAM = "app.search_service.overpass_client.query"


class TestUniversityClassification:
    @pytest.mark.parametrize("amenity", ["university", "college"])
    def test_university_amenity_is_classified(self, amenity):
        """Erken cikis universiteleri None'a dusuruyordu."""
        result = classify_school_level({"amenity": amenity}, "Bogazici Universitesi")
        assert result == "college_university"

    def test_university_wins_over_name_keywords(self):
        """
        Adinda 'kolej' gecse bile amenity=university ise universitedir:
        etiket isim sezgisinden guclu.
        """
        result = classify_school_level(
            {"amenity": "university"}, "Istanbul Koleji Universitesi"
        )
        assert result == "college_university"

    def test_kolej_named_school_is_not_university(self):
        """Adinda kolej gecen okul K-12; universite turune kaymamali."""
        result = classify_school_level({"amenity": "school"}, "Bilfen Koleji")
        assert result == "college_keyword"

    def test_plain_school_unaffected(self):
        """Degisiklik normal okul siniflandirmasini bozmamali."""
        assert (
            classify_school_level({"amenity": "school"}, "Ataturk Ilkokulu")
            == "primary_school"
        )


class TestUniversityIsASearchableType:
    def test_type_is_registered(self):
        """RADIUS_PRESETS hem varsayilan yaricabi hem desteklenen tur listesini besliyor."""
        assert "college_university" in RADIUS_PRESETS

    def test_search_accepts_the_type(self, client):
        """Onceden 'Unsupported type' ile 422 donerdi."""
        with patch(SEAM, new=overpass_stub([])):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=3000&type=college_university"
            )
        assert response.status_code == 200

    def test_search_returns_universities(self, client):
        """Uctan uca: universite etiketli kayit sonuca girmeli."""
        elements = [
            {
                "type": "node",
                "id": 1,
                "lat": 41.015,
                "lon": 28.980,
                "tags": {"amenity": "university", "name": "Istanbul Universitesi"},
            },
            {
                "type": "node",
                "id": 2,
                "lat": 41.016,
                "lon": 28.981,
                "tags": {"amenity": "school", "name": "Test Ilkokulu"},
            },
        ]
        with patch(SEAM, new=overpass_stub(elements)):
            response = client.get(
                "/api/search?lat=41.0&lon=29.0&radius=3000&type=college_university"
            )

        assert response.status_code == 200
        results = response.json()["results"]
        assert len(results) == 1
        assert results[0]["name"] == "Istanbul Universitesi"
        assert results[0]["type"] == "college_university"

    def test_presets_expose_the_type(self, client):
        """Arayuz tur listesini /api/presets'ten aliyor."""
        response = client.get("/api/presets")
        assert response.status_code == 200
        body = response.json()

        assert body["type_labels_tr"]["college_university"] == "Üniversite"
        # Kolej ayri bir tur olarak kalmali
        assert body["type_labels_tr"]["college_keyword"] == "Kolej"

        education = next(
            g["types"]
            for g in body["type_groups_tr"]
            if g["group"] == "Eğitim Kurumları"
        )
        assert "college_university" in education
