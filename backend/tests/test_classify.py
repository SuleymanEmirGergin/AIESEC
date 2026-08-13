"""Unit tests for classification logic."""

import pytest
from app.classify import classify_school_level, classify_b2b_type, has_name


class TestSchoolClassification:
    """Tests for school level classification."""

    def test_kindergarten_by_amenity(self):
        """Test kindergarten classification by amenity tag."""
        tags = {"amenity": "kindergarten"}
        result = classify_school_level(tags, "Test Kreş")
        assert result == "kindergarten"

    def test_primary_school_by_isced(self):
        """Test primary school classification by ISCED tag."""
        tags = {"amenity": "school", "isced:level": "1"}
        result = classify_school_level(tags, "Unknown School")
        assert result == "primary_school"

    def test_middle_school_by_isced(self):
        """Test middle school classification by ISCED tag."""
        tags = {"amenity": "school", "isced:level": "2"}
        result = classify_school_level(tags, "Unknown School")
        assert result == "middle_school"

    def test_high_school_by_isced(self):
        """Test high school classification by ISCED tag."""
        tags = {"amenity": "school", "isced:level": "3"}
        result = classify_school_level(tags, "Unknown School")
        assert result == "high_school"

    def test_primary_school_by_name_turkish(self):
        """Test primary school classification by Turkish keyword."""
        tags = {"amenity": "school"}
        result = classify_school_level(tags, "Atatürk İlkokulu")
        assert result == "primary_school"

    def test_middle_school_by_name_turkish(self):
        """Test middle school classification by Turkish keyword."""
        tags = {"amenity": "school"}
        result = classify_school_level(tags, "Cumhuriyet Ortaokulu")
        assert result == "middle_school"

    def test_high_school_by_name_turkish(self):
        """Test high school classification by Turkish keyword."""
        tags = {"amenity": "school"}
        result = classify_school_level(tags, "Anadolu Lisesi")
        assert result == "high_school"

    def test_college_keyword(self):
        """Test college keyword classification."""
        tags = {"amenity": "school"}
        result = classify_school_level(tags, "İstanbul Koleji")
        assert result == "college_keyword"

    def test_private_school_by_name(self):
        """Test private school classification by 'özel' keyword."""
        tags = {"amenity": "school"}
        result = classify_school_level(tags, "Özel İlkokul")
        # Should match private_school (özel) before primary (ilkokul)
        assert result == "private_school"

    def test_priority_college_over_private(self):
        """Test that 'kolej' has higher priority than 'özel'."""
        tags = {"amenity": "school"}
        result = classify_school_level(tags, "Özel Bilfen Koleji")
        assert result == "college_keyword"

    def test_priority_tags_over_name(self):
        """Test that ISCED tags have priority over name."""
        tags = {"amenity": "school", "isced:level": "2"}
        # Name suggests high school but tag says middle school
        result = classify_school_level(tags, "Fen Lisesi")
        assert result == "middle_school"

    def test_priority_order_in_name(self):
        """Test priority order when multiple keywords in name."""
        tags = {"amenity": "school"}
        # Contains both "ilkokul" and "ortaokul" - primary should win
        result = classify_school_level(tags, "İlkokul ve Ortaokul")
        assert result == "primary_school"

    def test_case_insensitive_matching(self):
        """Test case-insensitive keyword matching."""
        tags = {"amenity": "school"}
        result = classify_school_level(tags, "ATATÜRK İLKOKULU")
        assert result == "primary_school"

    def test_turkish_casefold(self):
        """Test Turkish-specific case folding."""
        tags = {"amenity": "school"}
        # Turkish 'İ' should match 'i' in casefold
        result = classify_school_level(tags, "İLKOKUL")
        assert result == "primary_school"

    def test_no_match_returns_none(self):
        """Test that unmatched schools return None."""
        tags = {"amenity": "school"}
        result = classify_school_level(tags, "Unknown Foreign School")
        assert result is None

    def test_not_a_school_returns_none(self):
        """Test that non-school amenities return None."""
        tags = {"amenity": "cafe"}
        result = classify_school_level(tags, "Café School")
        assert result is None


class TestB2BClassification:
    """Tests for B2B type classification."""

    def test_factory_by_industrial_tag(self):
        """Test factory classification by industrial tag."""
        tags = {"industrial": "factory"}
        result = classify_b2b_type(tags, "way")
        assert result == "factory"

    def test_factory_by_man_made(self):
        """Test factory classification by man_made tag."""
        tags = {"man_made": "works"}
        result = classify_b2b_type(tags, "node")
        assert result == "factory"

    def test_factory_by_building(self):
        """Test factory classification by building tag."""
        tags = {"building": "industrial"}
        result = classify_b2b_type(tags, "way")
        assert result == "factory"

    def test_factory_by_landuse(self):
        """Test factory classification by landuse tag."""
        tags = {"landuse": "industrial"}
        result = classify_b2b_type(tags, "way")
        assert result == "factory"

    def test_factory_by_building_warehouse(self):
        """Test factory classification by building=warehouse tag."""
        tags = {"building": "warehouse"}
        result = classify_b2b_type(tags, "way")
        assert result == "factory"

    def test_office_by_office_tag(self):
        """Test office classification by office tag."""
        tags = {"office": "company"}
        result = classify_b2b_type(tags, "node")
        assert result == "office"

    def test_office_by_building(self):
        """Test office classification by building tag."""
        tags = {"building": "commercial"}
        result = classify_b2b_type(tags, "way")
        assert result == "office"

    def test_office_by_building_office(self):
        """Test office classification by building=office tag."""
        tags = {"building": "office"}
        result = classify_b2b_type(tags, "way")
        assert result == "office"

    def test_workshop_by_craft(self):
        """Test workshop classification by craft tag."""
        tags = {"craft": "carpenter"}
        result = classify_b2b_type(tags, "node")
        assert result == "workshop"

    def test_workshop_by_industrial(self):
        """Test workshop classification by industrial tag."""
        tags = {"industrial": "workshop"}
        result = classify_b2b_type(tags, "node")
        assert result == "workshop"

    def test_workshop_wins_over_building_warehouse(self):
        """Test that craft tag takes priority over building=warehouse."""
        # Atolyeler sik sik depo binasinda oturur. building=warehouse
        # fabrika dalinda oldugu icin, craft kontrolu onunde kalmazsa
        # bu kayitlar fabrika olarak siniflanir. Sirayi kilitleyen test.
        tags = {"building": "warehouse", "craft": "carpenter"}
        result = classify_b2b_type(tags, "way")
        assert result == "workshop"

    def test_no_match_returns_none(self):
        """Test that unmatched B2B types return None."""
        tags = {"amenity": "restaurant"}
        result = classify_b2b_type(tags, "node")
        assert result is None


class TestHasName:
    """Tests for has_name function."""

    def test_has_name_tag(self):
        """Test element with name tag."""
        tags = {"name": "Test Place"}
        assert has_name(tags) is True

    def test_has_official_name_tag(self):
        """Test element with official_name tag."""
        tags = {"official_name": "Official Name"}
        assert has_name(tags) is True

    def test_no_name_tags(self):
        """Test element without name tags."""
        tags = {"amenity": "school"}
        assert has_name(tags) is False

    def test_empty_name_tag(self):
        """Test element with empty name tag."""
        tags = {"name": ""}
        assert has_name(tags) is False
