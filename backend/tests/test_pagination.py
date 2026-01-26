"""Unit tests for pagination functionality."""

import pytest
from app.models import SearchParams
from app.pagination import PaginatedResponse, PaginationMeta


class TestSearchParamsPagination:
    """Tests for pagination parameters in SearchParams."""

    def test_default_pagination(self):
        """Test default values for limit and offset."""
        params = SearchParams(
            lat=41.0,
            lon=29.0,
            radius=1500,
            type="kindergarten"
        )
        assert params.limit == 20
        assert params.offset == 0

    def test_custom_limit(self):
        """Test custom limit value."""
        params = SearchParams(
            lat=41.0,
            lon=29.0,
            radius=1500,
            type="kindergarten",
            limit=50
        )
        assert params.limit == 50

    def test_custom_offset(self):
        """Test custom offset value."""
        params = SearchParams(
            lat=41.0,
            lon=29.0,
            radius=1500,
            type="kindergarten",
            offset=40
        )
        assert params.offset == 40

    def test_limit_minimum_validation(self):
        """Test that limit must be >= 1."""
        with pytest.raises(ValueError):
            SearchParams(
                lat=41.0,
                lon=29.0,
                radius=1500,
                type="kindergarten",
                limit=0
            )

    def test_limit_maximum_validation(self):
        """Test that limit must be <= 100."""
        with pytest.raises(ValueError):
            SearchParams(
                lat=41.0,
                lon=29.0,
                radius=1500,
                type="kindergarten",
                limit=101
            )

    def test_offset_negative_validation(self):
        """Test that offset must be >= 0."""
        with pytest.raises(ValueError):
            SearchParams(
                lat=41.0,
                lon=29.0,
                radius=1500,
                type="kindergarten",
                offset=-1
            )


class TestPaginationMeta:
    """Tests for PaginationMeta model."""

    def test_has_more_true(self):
        """Test has_more when more results exist."""
        meta = PaginationMeta(
            limit=20,
            offset=0,
            total=85,
            has_more=True
        )
        assert meta.has_more is True

    def test_has_more_false(self):
        """Test has_more when no more results exist."""
        meta = PaginationMeta(
            limit=20,
            offset=80,
            total=85,
            has_more=False
        )
        assert meta.has_more is False

    def test_pagination_meta_serialization(self):
        """Test PaginationMeta can be serialized."""
        meta = PaginationMeta(
            limit=20,
            offset=0,
            total=42,
            has_more=True
        )
        data = meta.model_dump()
        assert data["limit"] == 20
        assert data["offset"] == 0
        assert data["total"] == 42
        assert data["has_more"] is True
