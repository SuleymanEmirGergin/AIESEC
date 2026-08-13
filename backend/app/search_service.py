import logging
import os
from typing import List, Literal, Optional, Tuple

from geopy.distance import geodesic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.classify import classify_b2b_type, classify_school_level
from app.database import Override
from app.geo import bbox_from_radius
from app.models import Place
from app.overpass import build_overpass_query, overpass_client

# Stage 2 (isimsiz kayitlar) esikleri: stage 1 bu sayidan az sonuc
# dondurduyse ikinci bir Overpass turu yapiliyor.
#
# Her tur tam bir Overpass sorgusu demek. Olcumde ayni aramada stage 1
# 50.6 sn, stage 2 174.9 sn surdu; gereksiz bir stage 2 toplam surenin
# buyuk kismini yiyor.
#
# Esikler kategoriye gore ayrildi:
# - Egitim: okullar OSM'de neredeyse her zaman isimli. Stage 2 cogunlukla
#   bosa giden bir tur, bu yuzden esik dusuk.
# - B2B: isimsiz sanayi alanlarini bulmak ozelligin asil amaci
#   (README: "Helps identify industrial zones"), esik yuksek kaliyor.
MIN_STAGE1_B2B = int(os.getenv("MIN_STAGE1_B2B", "25"))
MIN_STAGE1_SCHOOL = int(os.getenv("MIN_STAGE1_SCHOOL", "8"))

logger = logging.getLogger(__name__)


def is_valid_unnamed(element: dict, requested_type: str) -> bool:
    """
    Apply strict post-filtering for unnamed results.
    Rules: Must have contact info OR specific industrial/commercial tags.
    """
    tags = element.get("tags", {})
  
    # 1. Keep if has contact info
    if any(k.startswith("contact:") or k in ["phone", "website", "email"] for k in tags):
        return True
      
    # 2. Keep if is a specific building/utility type
    b_type = tags.get("building", "")
    if b_type in ["industrial", "commercial", "warehouse"]:
        return True
      
    if tags.get("man_made") == "works" or tags.get("industrial") or tags.get("landuse") == "industrial":
        return True
      
    # Type specific validations
    if requested_type == "workshop" and tags.get("craft"):
        return True
    if requested_type == "office" and tags.get("office"):
        return True
      
    return False


def normalize_and_dedupe(places: List[Place], distance_threshold_m: float = 20.0) -> List[Place]:
    """
    Deduplicate results based on name similarity and spatial proximity.
    If two objects have the same name and are within threshold distance, merge them.
    """
    if not places:
        return []

    # 1. Normalize names first
    for p in places:
        if p.name:
            p.name = p.name.strip()

    # 2. Sort by name
    sorted_places = sorted(places, key=lambda x: (x.name or "", x.id))
    deduped = []
    
    if not sorted_places:
        return []

    current_group = [sorted_places[0]]

    for i in range(1, len(sorted_places)):
        prev = current_group[-1]
        curr = sorted_places[i]

        same_name = prev.name and curr.name and prev.name.lower() == curr.name.lower()
        
        if same_name:
            # Place modeli duz lat/lon tutuyor; coordinates diye bir alan yok.
            # Bu erisim AttributeError firlatiyor ve arama, ayni isimli iki
            # kayit gelir gelmez sessizce bos donuyordu.
            dist = geodesic(
                (prev.lat, prev.lon),
                (curr.lat, curr.lon)
            ).meters
            
            if dist < distance_threshold_m:
                if len(curr.tags) > len(prev.tags):
                    current_group[-1] = curr
                continue

        deduped.append(prev)
        current_group = [curr]
    
    deduped.append(current_group[-1])
    return deduped


async def execute_query_stage(
    mode: Literal["around", "bbox"],
    stage: int,
    place_type: str,
    lat: float,
    lon: float,
    radius: int,
    ref_lat: Optional[float] = None,
    ref_lon: Optional[float] = None,
    bbox: Optional[Tuple[float, float, float, float]] = None,
    overrides: dict = None
) -> List[Place]:
    """
    Execute a single query stage (1=named, 2=unnamed) and wrap as Places.
    Includes server-side radius filtering for bbox mode.
    """
    query = build_overpass_query(
        requested_type=place_type,
        lat=lat,
        lon=lon,
        radius=radius,
        stage=stage,
        mode=mode,
        bbox=bbox
    )
   
    data = await overpass_client.query(query, debug=True)
    elements = data.get("elements", [])
   
    places = []
    for el in elements:
        if stage == 2 and not is_valid_unnamed(el, place_type):
            continue
           
        try:
            el_id = el.get("id")
            el_type = el.get("type", "node")
            place = Place.from_osm_element(
                element=el,
                place_type=place_type,
                search_lat=lat,
                search_lon=lon,
                ref_lat=ref_lat,
                ref_lon=ref_lon,
                is_overridden=(overrides and f"osm:{el_type}:{el_id}" in overrides)
            )
           
            if mode == "bbox" and place.distance and place.distance > radius:
                continue
               
            places.append(place)
        except Exception:
            continue
           
    return places


async def run_search_orchestration(
    mode: Literal["around", "bbox"],
    radius: int,
    place_type: str,
    lat: float,
    lon: float,
    ref_lat: Optional[float] = None,
    ref_lon: Optional[float] = None,
    db: Optional[AsyncSession] = None,
    explicit_bbox: Optional[Tuple[float, float, float, float]] = None
) -> Tuple[List[Place], bool]:
    """
    Perform 2-stage search orchestration for a specific mode and radius.
    Handles Stage 1 (named) and conditional Stage 2 (unnamed) retrieval.

    explicit_bbox verilirse (south, west, north, east) o alan aynen
    taranir. Cagiran gercek bir dikdortgen biliyorsa (orn. haritanin
    goruntu alani) bunu daireye cevirip tekrar dikdortgene donmek
    gereksiz genis bir alan taratiyordu.
    """
    if explicit_bbox is not None:
        bbox = explicit_bbox
    else:
        bbox = bbox_from_radius(lat, lon, radius) if mode == "bbox" else None

    # Apply Grid Snapping (0.01 degree) for consistency
    lat = round(lat / 0.01) * 0.01
    lon = round(lon / 0.01) * 0.01

    # 1. Stage 1: Named objects
    results = await execute_query_stage(
        mode=mode, stage=1, place_type=place_type,
        lat=lat, lon=lon, radius=radius,
        ref_lat=ref_lat, ref_lon=ref_lon, bbox=bbox,
        overrides=None
    )
   
    # 2. Stage 2: Unnamed objects
    is_edu = place_type in [
        "kindergarten", "primary_school", "middle_school", "high_school",
        "private_school", "college_keyword", "college_university"
    ]
    threshold = MIN_STAGE1_SCHOOL if is_edu else MIN_STAGE1_B2B
   
    stage2_used = False
    if len(results) < threshold:
        stage2_used = True
        try:
            s2_results = await execute_query_stage(
                mode=mode, stage=2, place_type=place_type,
                lat=lat, lon=lon, radius=radius,
                ref_lat=ref_lat, ref_lon=ref_lon, bbox=bbox,
                overrides=None
            )
            results.extend(s2_results)
        except Exception:
            pass
           
    # 3. Post-process: Normalization & Spatial Deduplication
    results = normalize_and_dedupe(results)

    # 4. Apply Overrides
    if db:
        place_ids = [p.id for p in results]
        ov_query = select(Override).where(
            Override.place_id.in_(place_ids),
            Override.is_active
        )
        ov_result = await db.execute(ov_query)
        overrides = {o.place_id: o for o in ov_result.scalars().all()}
       
        for p in results:
            if p.id in overrides:
                ov = overrides[p.id]
                p.type = ov.forced_type
                if ov.forced_subtype:
                    p.subtype = ov.forced_subtype
                p.confidence = min(100, p.confidence + 10)
                if p.confidence >= 70: p.confidence_level = "high"
                elif p.confidence >= 40: p.confidence_level = "medium"

    # 5. Final Filter by classification
    deduped = results
    if is_edu:
        deduped = [
            p for p in deduped
            if (classified := classify_school_level(p.tags, p.name or ""))
            and (classified == place_type or (place_type == "school" and classified != "None"))
        ]
    elif place_type in {"factory", "office", "workshop"}:
        deduped = [
            p for p in deduped 
            if classify_b2b_type(p.tags, p.id.split(":")[1]) == place_type
        ]
        
    return deduped, stage2_used
