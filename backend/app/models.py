import os
from datetime import date, datetime
from enum import Enum
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
    # Universiteler seyrek dagildigi icin varsayilan yaricap genis.
    "college_university": 5000,
    "office": 2000,
    "workshop": 3000,
    "factory": 5000,
    "hotel": 3000,
    "company": 3000,
    # Holdingler seyrek; genis yaricap.
    "holding": 5000,
    "real_estate": 2000,
    "language_school": 2000,
    "travel_agency": 2000,
    # Gezi & eglence seyrek; genis yaricap.
    "zoo_aquarium": 5000,
    "theme_park": 5000,
    "museum": 3000,
    "botanical_garden": 5000,
    "nature_park": 5000,
}

# Tag whitelist for result cleanup
#
# Iletisim etiketleri OSM'de iki bicimde yasiyor: duz (`phone`, `email`)
# ve `contact:` onekli (`contact:phone`). Onekli olanlar asagida prefix
# kuraliyla toptan geciyor, duz olanlarin burada tek tek sayilmasi
# gerekiyor. `email`, `mobile` ve `fax` listede yoktu; bu yuzden yalnizca
# duz `email` etiketi tasiyan kayitlarin iletisim bilgisi arayuze
# hic ulasmiyordu.
TAG_WHITELIST = {
    "name",
    "official_name",
    "amenity",
    "office",
    "craft",
    "industrial",
    "man_made",
    "building",
    "shop",
    "website",
    "phone",
    "email",
    "mobile",
    "fax",
    "opening_hours",
    "operator",
    "brand",
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
        None,
        ge=-180,
        le=180,
        description="Reference longitude for distance calculation",
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
                k: v
                for k, v in tags.items()
                if k in TAG_WHITELIST
                or k.startswith("addr:")
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
            k.startswith("contact:") or k in ["phone", "website", "email"] for k in tags
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
            confidence_level=level,
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
    center: Dict[str, float]  # {"lat": ..., "lon": ...}
    # Full item data for file construction. Next route'u ile ayni sinir;
    # 10.000 satirlik PDF ~50 sn suruyor.
    items: List[Dict[str, Any]] = Field(..., max_length=10_000)
    # Varsayilan csv: eski istemciler alan gondermeden ayni sonucu alir.
    format: Literal["csv", "xlsx", "pdf"] = "csv"
    # PDF/Excel basligi, or. "Kadıköy · Otel" ya da liste adi.
    title: Optional[str] = Field(None, max_length=120)


class ReportListResponse(BaseModel):
    """
    Sayfalanmis rapor listesi.

    Onceden uc duz bir dizi donuyordu ve toplam kayit sayisi hicbir yerde
    yoktu; istemci sayfalamayi ancak tahminle yapabiliyordu. `total`
    filtrelenmis kumenin tamaminin sayisi (sayfanin degil).
    """

    data: List[ReportDetailedResponse]
    total: int


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


class APIKeyAdminResponse(APIKeyResponse):
    """
    Yonetim listesindeki anahtar kaydi.

    `id` yalnizca burada var: PATCH /admin/keys/{id} icin gerekli.
    Ad (`name`) benzersiz degil - ayni adla birden fazla anahtar
    uretilebiliyor - dolayisiyla guncelleme adres olarak id kullaniyor.
    Duz anahtar hicbir kosulda donmuyor; veritabaninda yalnizca SHA256
    ozeti duruyor.
    """

    id: int


class APIKeyAdminUpdate(BaseModel):
    """
    Mevcut bir anahtarin plan/kota/aktiflik durumunu degistirir.

    Neden gerekli: plan yalnizca anahtar uretilirken belirlenebiliyordu.
    Bir hesabi Pro'ya cikarmanin tek yolu ya yeni anahtar uretmek ya da
    SQLite dosyasina elle mudahale etmekti; ikisi de mevcut kullanicinin
    anahtarini gecersiz kiliyor ya da izlenemez bir degisiklik biraliyor.
    """

    plan: Optional[Literal["free", "pro", "enterprise"]] = None
    daily_limit: Optional[int] = Field(None, ge=1, le=1_000_000)
    is_active: Optional[bool] = None


# --- Kayitli yerler ve listeler -------------------------------------------


class PlaceListCreate(BaseModel):
    """Yeni liste."""

    name: str = Field(..., min_length=1, max_length=120)
    note: Optional[str] = Field(None, max_length=500)


class PlaceListUpdate(BaseModel):
    """Liste adi/notu guncelleme. Gonderilmeyen alan degismez."""

    name: Optional[str] = Field(None, min_length=1, max_length=120)
    note: Optional[str] = Field(None, max_length=500)


class PlaceListResponse(BaseModel):
    id: str
    name: str
    note: Optional[str]
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str]
    # Arayuz liste basina sayiyi ayri bir istekle almasin diye burada.
    place_count: int = 0


class SavedPlaceData(BaseModel):
    """
    Kaydedilecek yerin kendisi.

    Yerin tamami gonderiliyor, yalnizca id degil: kayit arama
    onbelleginin hala duruyor olmasina bagimli olmamali.
    """

    place_id: str = Field(..., min_length=1, max_length=200)
    name: Optional[str] = Field(None, max_length=300)
    place_type: Optional[str] = Field(None, max_length=60)
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    address: Optional[str] = Field(None, max_length=500)
    tags: Dict[str, Any] = Field(default_factory=dict)


class SavedPlaceCreate(SavedPlaceData):
    """Tek yer kaydi; not ve liste burada verilebilir."""

    note: Optional[str] = Field(None, max_length=1000)
    list_id: Optional[str] = None


# En kalabalik ilce (Eyupsultan) ~8600 yer; tek istekte tamami sigmali.
MAX_BULK_SAVE = 10_000


class SavedPlaceBulkCreate(BaseModel):
    """
    Toplu kayit. Liste tek ve istegin tamamina uygulanir; verilmezse yeni
    kayitlar dosyalanmamis olur, mevcutlarin listesine dokunulmaz.
    """

    items: List[SavedPlaceData] = Field(..., min_length=1, max_length=MAX_BULK_SAVE)
    list_id: Optional[str] = None


class SavedPlaceBulkMove(BaseModel):
    """Kayitli yerleri (kayit id'leriyle) bir listeye ya da dosyalanmamisa tasi."""

    ids: List[str] = Field(..., min_length=1, max_length=MAX_BULK_SAVE)
    # None: dosyalanmamis
    list_id: Optional[str] = None


class SavedPlaceBulkUpdate(BaseModel):
    """
    Secili kayitlara toplu islem. En az bir alan gonderilmeli; gonderilmeyen
    alan degismez (assignee/next_follow_up_at icin null "kaldir" demek).
    Durum degisikligi her kayda temas gecmisi olarak yaziliyor.
    """

    ids: List[str] = Field(..., min_length=1, max_length=MAX_BULK_SAVE)
    contact_status: Optional["ContactStatus"] = None
    assignee: Optional["Assignee"] = None
    next_follow_up_at: Optional[date] = None


class SavedPlaceBulkResponse(BaseModel):
    created: int
    # place_id -> kayitli yer id'si (yeni ya da zaten kayitli olan)
    ids: Dict[str, str]


class Assignee(BaseModel):
    """Sorumlu gonullu: e-posta kimlik, ad gosterim icin."""

    email: str = Field(..., max_length=254, pattern=r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
    name: str = Field(..., min_length=1, max_length=120)


class SavedPlaceUpdate(BaseModel):
    """Not, liste, sorumlu ya da takip tarihi. Gonderilmeyen alan degismez."""

    note: Optional[str] = Field(None, max_length=1000)
    list_id: Optional[str] = None
    # None: atamayi kaldir.
    assignee: Optional[Assignee] = None
    # None: takibi kaldir.
    next_follow_up_at: Optional[date] = None
    # list_id=None "dosyalanmamisa tasi" demek olabilir; hangi alanin
    # gercekten gonderildigini ayirmak icin exclude_unset kullaniliyor.


class ContactStatus(str, Enum):
    uncontacted = "uncontacted"
    preparing = "preparing"
    contacted = "contacted"
    follow_up = "follow_up"
    positive = "positive"
    not_suitable = "not_suitable"


class ContactEventCreate(BaseModel):
    status: ContactStatus
    contacted_at: date
    note: Optional[str] = Field(None, max_length=1000)
    next_follow_up_at: Optional[date] = None


class ContactEventResponse(BaseModel):
    id: str
    saved_place_id: str
    status: ContactStatus
    contacted_at: date
    note: Optional[str]
    next_follow_up_at: Optional[date]
    volunteer_name: str
    created_at: datetime


class SavedPlaceResponse(BaseModel):
    id: str
    list_id: Optional[str]
    place_id: str
    name: Optional[str]
    place_type: Optional[str]
    lat: float
    lon: float
    address: Optional[str]
    tags: Dict[str, Any]
    note: Optional[str]
    saved_by: Optional[str]
    contact_status: ContactStatus
    last_contact_at: Optional[date]
    next_follow_up_at: Optional[date]
    assigned_to: Optional[str] = None
    assigned_name: Optional[str] = None
    assigned_by: Optional[str] = None
    assigned_at: Optional[datetime] = None
    # Yerin ilcesi (sinir ici oncelikli); filtre icin. Ilce verisinde yoksa None.
    district_id: Optional[str] = None
    district_name: Optional[str] = None
    created_at: datetime


class ExportHistoryItem(BaseModel):
    """Gecmiste alinan bir CSV."""

    id: int
    created_at: datetime
    type: str
    item_count: int
    center_lat: float
    center_lon: float
    radius: int


class PresetResponse(BaseModel):
    """Radius presets and UI labels for client UI."""

    max_radius: int
    default_by_type: Dict[str, int]
    radius_options: List[int]
    default_mode: str
    notes: str
    type_labels_tr: Dict[str, str]
    type_groups_tr: List[Dict[str, Any]]


# --- Ilce secimli yerel arama -----------------------------------------


class DistrictMeta(BaseModel):
    """Bir ilcenin geometrisiz metadata'si (secici listesi icin)."""

    id: str
    name: str
    province: str
    province_plate: str
    bbox: List[float] = Field(..., description="(south, west, north, east)")
    center: List[float] = Field(..., description="(lat, lon)")
    # Ingest durumu: hic cekilmemis ilce icin None. Arayuz talep uzerine
    # ingest'i ve tazelik uyarisini buna bakarak gosteriyor.
    fetched_at: Optional[datetime] = None
    place_count: Optional[int] = None
    status: Optional[str] = None


class DistrictPlace(BaseModel):
    """Yerel veritabanindan donen POI."""

    id: str
    name: Optional[str] = None
    place_type: Optional[str] = None
    subtype: Optional[str] = None
    lat: float
    lon: float
    address: Optional[str] = None
    confidence: int = 0
    has_contact: bool = False
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    # Sadece sort=lead_score istendiginde doluyor; diger siralamalarda
    # hesaplanmasi bosuna is olurdu.
    lead_score: Optional[int] = None

    model_config = {"from_attributes": True}


class DistrictPlacesResponse(BaseModel):
    """
    Sayfalanmis sonuc.

    total sayfa boyutundan bagimsiz: arayuz "412 sonuctan 1-50"
    gosterebilsin.
    """

    district_id: str
    data: List[DistrictPlace]
    total: int
    limit: int
    offset: int


class DistrictSummaryResponse(BaseModel):
    """
    "Bu ilcede ne var?" sorusunun tek istekli cevabi; tur chip'lerindeki
    sayilari besliyor.
    """

    district_id: str
    name: str
    counts: Dict[str, int]
    total: int
    fetched_at: Optional[datetime] = None
    place_count: Optional[int] = None
    status: Optional[str] = None


# ContactStatus SavedPlaceBulkUpdate'ten sonra tanimli (ileri referans).
SavedPlaceBulkUpdate.model_rebuild()
