import os
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


# Radius presets based on type
RADIUS_PRESETS = {
    "kindergarten": 1000,
    "primary_school": 1500,
    "middle_school": 2000,
    "high_school": 2500,
    "private_school": 2500,
    "college_keyword": 2500,
    "office": 2000,
    "workshop": 3000,
    "factory": 5000,
}

# Tag whitelist for result cleanup
TAG_WHITELIST = {
    "name", "official_name", "amenity", "office", "craft",
    "industrial", "man_made", "building", "shop", "website",
    "phone", "opening_hours", "operator", "brand"
}


class SearchParams(BaseModel):
    """Search request parameters."""

    lat: float = Field(..., ge=-90, le=90, description="Latitude")
    lon: float = Field(..., ge=-180, le=180, description="Longitude")
    radius: int = Field(
        default=1500,
        ge=100,
        le=5000,
        description="Search radius in meters (100-5000)",
    )
    type: str = Field(..., description="Type of place to search for")
    limit: int = Field(
        default=500,
        ge=1,
        le=1000,
        description="Maximum number of results to return (1-1000)",
    )
    offset: int = Field(
        default=0,
        ge=0,
        description="Number of results to skip (for pagination)",
    )
    ref_lat: Optional[float] = Field(
        None, ge=-90, le=90, description="Reference latitude for distance calculation"
    )
    ref_lon: Optional[float] = Field(
        None, ge=-180, le=180,
        description="Reference longitude for distance calculation"
    )
    mode: Literal["auto", "around", "bbox"] = Field(
        default="auto", description="Overpass search strategy"
    )

    @field_validator("lat")
    @classmethod
    def validate_lat(cls, v: float) -> float:
        """Validate latitude range."""
        if not -90 <= v <= 90:
            raise ValueError("Latitude must be between -90 and 90")
        return v


class Address(BaseModel):
    """Address details from OSM tags."""

    street: Optional[str] = None
    house_number: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None
    suburb: Optional[str] = None

    @classmethod
    def from_tags(cls, tags: dict) -> Optional["Address"]:
        """Extract address components from element tags."""
        addr_parts = {
            "street": tags.get("addr:street"),
            "house_number": tags.get("addr:housenumber"),
            "city": tags.get("addr:city"),
            "postcode": tags.get("addr:postcode"),
            "suburb": tags.get("addr:suburb") or tags.get("addr:neighbourhood"),
        }
        if any(addr_parts.values()):
            return cls(**addr_parts)
        return None

    def to_string(self) -> str:
        """Format address components into a single line."""
        parts = []
        if self.street:
            street_num = f"{self.street} {self.house_number or ''}".strip()
            parts.append(street_num)
        if self.suburb:
            parts.append(self.suburb)
        if self.city:
            city_zip = f"{self.postcode or ''} {self.city}".strip()
            parts.append(city_zip)
        return ", ".join(parts)


class Place(BaseModel):
    """Place information for mobile app display."""

    id: str = Field(..., description="Unique ID (osm:type:id)")
    name: Optional[str] = Field(None, description="Place name")
    type: str = Field(..., description="Place category")
    subtype: Optional[str] = Field(None, description="Granular place subtype")
    lat: float = Field(..., description="Latitude")
    lon: float = Field(..., description="Longitude")
    address: str = Field(
        default="Address not available", description="Formatted address string"
    )
    tags: dict = Field(default_factory=dict, description="OSM tags")
    source: Literal["osm_overpass"] = Field(
        default="osm_overpass", description="Data source"
    )
    distance: Optional[float] = Field(
        None, description="Distance from search center in meters"
    )
    distance_m: Optional[float] = Field(
        None, description="Distance from reference point (ref_lat, ref_lon) in meters"
    )
    unnamed: Optional[bool] = Field(
        None, description="Flag for places without a name tag"
    )
    confidence: int = Field(0, description="Confidence score (0-100)")
    confidence_level: Literal["high", "medium", "low"] = Field(
        "low", description="Confidence level category"
    )

    @classmethod
    def from_osm_element(
        cls,
        element: dict,
        place_type: str,
        search_lat: float,
        search_lon: float,
        ref_lat: Optional[float] = None,
        ref_lon: Optional[float] = None,
        search_lat_rad: float | None = None,
        search_lon_rad: float | None = None,
        ref_lat_rad: float | None = None,
        ref_lon_rad: float | None = None,
        is_overridden: bool = False,
    ) -> "Place":
        """Create Place from OSM Overpass element."""
        from app.geo import haversine_distance_m

        osm_id = element.get("id")
        osm_type = element.get("type", "node")
        tags = element.get("tags", {})

        # Get coordinates (use center for ways/relations)
        if "center" in element:
            lat_val = element["center"]["lat"]
            lon_val = element["center"]["lon"]
        else:
            lat_val = element.get("lat")
            lon_val = element.get("lon")

        # Basic distance from search center
        distance = haversine_distance_m(search_lat, search_lon, lat_val, lon_val)

        # Distance from ref point if provided
        distance_m = None
        if ref_lat is not None and ref_lon is not None:
            distance_m = haversine_distance_m(ref_lat, ref_lon, lat_val, lon_val)

        name = tags.get("name") or tags.get("official_name")
        unnamed_flag = name is None

        # Build address string
        addr_obj = Address.from_tags(tags)
        address_str = addr_obj.to_string() if addr_obj else "Address not available"

        # Filter tags for payload reduction
        debug_mode = os.getenv("DEBUG_OVERPASS", "false").lower() == "true"
        if not debug_mode:
            filtered_tags = {
                k: v for k, v in tags.items()
                if k in TAG_WHITELIST or k.startswith("addr:")
                or k.startswith("contact:")
            }
        else:
            filtered_tags = tags

        # Calculate Confidence
        score = 10  # Base confidence for any found object
        if name:
            score += 30
        if addr_obj:
            score += 20
        if any(
            k.startswith("contact:") or k in ["phone", "website", "email"]
            for k in tags
        ):
            score += 15
        if "operator" in tags or "brand" in tags:
            score += 10
        if is_overridden:
            score += 10
            
        # Bonus for building-level precision
        if tags.get("building"):
            score += 10

        # Penalty for area-only landuse (low precision)
        if tags.get("landuse") == "industrial" and not tags.get("building"):
            score -= 20
            
        score = max(0, min(100, score))

        if score >= 70:
            level = "high"
        elif score >= 40:
            level = "medium"
        else:
            level = "low"

        return cls(
            id=f"osm:{osm_type}:{osm_id}",
            name=name,
            type=place_type,
            lat=lat_val,
            lon=lon_val,
            address=address_str,
            tags=filtered_tags,
            distance=distance,
            distance_m=distance_m,
            unnamed=unnamed_flag if unnamed_flag else None,
            confidence=score,
            confidence_level=level
        )


class SearchResponse(BaseModel):
    """Response matching mobile app expectations."""

    results: list[Place]
    count: int
    query: SearchParams


class ReportRequest(BaseModel):
    """Request schema for reporting incorrect data."""
    place_id: str
    correct_type: str
    notes: Optional[str] = None
    lat: float
    lon: float
    shown_type: str
    name: Optional[str] = None
    client: Optional[str] = None
    app_version: Optional[str] = None


class ReportUpdateAdmin(BaseModel):
    """Admin update schema for reports."""
    status: Literal["open", "resolved", "ignored"]
    admin_notes: Optional[str] = None
    applied_override: Optional[bool] = None
    tags: Optional[List[str]] = None


class ReportDetailedResponse(BaseModel):
    """Detailed report view for admin."""
    id: int
    created_at: datetime
    place_id: str
    shown_type: str
    correct_type: str
    lat: float
    lon: float
    name: Optional[str]
    notes: Optional[str]
    client: Optional[str]
    app_version: Optional[str]
    ip: Optional[str]
    status: str
    admin_notes: Optional[str]
    tags: List[str]
    applied_override: bool
    resolved_at: Optional[datetime]


class OverrideCreate(BaseModel):
    """Schema for creating a classification override."""
    place_id: str
    forced_type: str
    forced_subtype: Optional[str] = None
    notes: Optional[str] = None
    is_active: bool = True


class OverrideUpdate(BaseModel):
    """Schema for patching an existing override."""
    forced_type: Optional[str] = None
    forced_subtype: Optional[str] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class OverrideResponse(OverrideCreate):
    """Full override data including metadata."""
    id: str
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str]


class ExportRequest(BaseModel):
    """Lead export request schema."""
    type: str
    radius: int
    center: Dict[str, float] # {"lat": ..., "lon": ...}
    items: List[Dict[str, Any]] # Full item data for CSV construction


class APIKeyResponse(BaseModel):
    """API Key details for admin."""
    name: str
    is_active: bool
    daily_limit: int
    used_today: int
    last_reset_date: datetime
    plan: str


class APIKeyCreateResponse(APIKeyResponse):
    """Response when a new key is created, including the plain key."""
    key: str


class PresetResponse(BaseModel):
    """Radius presets and UI labels for client UI."""
    max_radius: int
    default_by_type: Dict[str, int]
    radius_options: List[int]
    default_mode: str
    notes: str
    type_labels_tr: Dict[str, str]
    type_groups_tr: List[Dict[str, Any]]
