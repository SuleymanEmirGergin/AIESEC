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
