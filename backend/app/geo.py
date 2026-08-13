"""Geometry and distance calculation utilities."""

from math import asin, cos, radians, sin, sqrt


def haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great-circle distance between two points on Earth in meters.
    
    Args:
        lat1, lon1: First point coordinates
        lat2, lon2: Second point coordinates
        
    Returns:
        Distance in meters
    """
    # Convert decimal degrees to radians
    rlat1, rlon1, rlat2, rlon2 = map(radians, [lat1, lon1, lat2, lon2])

    # Haversine formula
    dlat = rlat2 - rlat1
    dlon = rlon2 - rlon1
    a = sin(dlat / 2) ** 2 + cos(rlat1) * cos(rlat2) * sin(dlon / 2) ** 2
    c = 2 * asin(sqrt(a))
    return c * 6371000  # Radius of Earth in meters


def bbox_from_radius(lat: float, lon: float, radius_m: int) -> tuple[float, float, float, float]:
    """
    Calculate bounding box coordinates for a given center and radius.
    
    Args:
        lat: Center latitude
        lon: Center longitude
        radius_m: Radius in meters
        
    Returns:
        tuple (south, west, north, east)
    """
    # Roughly 111,320 meters per degree of latitude
    lat_delta = radius_m / 111320.0
    
    # Longitude degree length depends on latitude
    lon_delta = radius_m / (111320.0 * cos(radians(lat)))
    
    south = max(-90.0, lat - lat_delta)
    north = min(90.0, lat + lat_delta)
    west = max(-180.0, lon - lon_delta)
    east = min(180.0, lon + lon_delta)

    return south, west, north, east


# --- Acik bbox destegi -------------------------------------------------
#
# Ic konvansiyon her yerde (south, west, north, east); Overpass da bu
# sirayi bekliyor. Dis API ise GeoJSON sirasini kullaniyor
# (minLon, minLat, maxLon, maxLat), cunku istemciler bbox'i boyle tutuyor.


def bbox_center(bbox: tuple[float, float, float, float]) -> tuple[float, float]:
    """(south, west, north, east) -> merkez (lat, lon)."""
    south, west, north, east = bbox
    return (south + north) / 2.0, (west + east) / 2.0


def bbox_circumscribed_radius_m(bbox: tuple[float, float, float, float]) -> int:
    """
    Bbox'i tamamen kapsayan dairenin yaricapi (merkezden koseye).

    Plan kisiti yaricap uzerinden tanimli oldugu icin, acik bbox
    geldiginde esdeger yaricap buradan turetiliyor. Boylece bbox
    kullanmak plan sinirini atlatmanin yolu olmuyor.
    """
    south, west, north, east = bbox
    lat, lon = bbox_center(bbox)
    return int(round(haversine_distance_m(lat, lon, north, east)))


def snap_bbox_outward(
    bbox: tuple[float, float, float, float], grid: float = 0.01
) -> tuple[float, float, float, float]:
    """
    Bbox kenarlarini izgaraya oturtur; hep DISARI dogru.

    Amac onbellek isabetini artirmak: haritayi birkac piksel kaydiran
    kullanici ayni sorguyu tekrar tetiklemesin. Yuvarlama disari dogru
    yapiliyor - iceri yuvarlamak kullanicinin gordugu alanin bir
    kismini sonuctan dusururdu; disari yuvarlamak yalnizca biraz fazla
    veri getirir.
    """
    from math import ceil, floor

    south, west, north, east = bbox
    return (
        max(-90.0, floor(south / grid) * grid),
        max(-180.0, floor(west / grid) * grid),
        min(90.0, ceil(north / grid) * grid),
        min(180.0, ceil(east / grid) * grid),
    )
