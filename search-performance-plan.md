# Implementation Plan: Search performance and optional limiting

Improve the `/api/search` endpoint performance by optimized distance calculations, update cache key logic, and increase result limits.

## User Review Required

> [!IMPORTANT]
> The `limit` parameter default will be increased from 20 to 500, and the maximum will be increased from 100 to 1000. 
> The cache key will now include the `limit` parameter, which means different limit requests will result in unique cache entries.

## Proposed Changes

### [Backend] Search Optimization & Limiting

#### [MODIFY] [models.py](file:///C:/Users/emirg/Desktop/AIESEC/backend/app/models.py)
- Update `SearchParams`:
    - `limit`: default=500, ge=1, le=1000.
- Optimize `Place.from_osm_element`:
    - Accept pre-calculated radians for search and reference points to avoid repeated math in the loop.

#### [MODIFY] [cache.py](file:///C:/Users/emirg/Desktop/AIESEC/backend/app/cache.py)
- Update `build_cache_key`:
    - Include `limit` in the key string: `;lim:<limit>`.

#### [MODIFY] [search.py](file:///C:/Users/emirg/Desktop/AIESEC/backend/app/routers/search.py)
- Refactor loop in `search_places`:
    - Pre-calculate radians for query coordinates.
    - Pass pre-calculated values to `Place.from_osm_element`.
- Ensure sorting correctly prioritizes `distance_m` when available.

---

## Verification Plan

### Automated Tests
- Run `tests/test_ref_distance.py` to ensure core logic remains sound.
- Create `tests/test_search_limits.py` to verify:
    - Default limit is 500.
    - Max limit of 1000 is respected.
    - Cache key includes limit.

**Command:**
```bash
python -m pytest tests/test_ref_distance.py tests/test_search_limits.py -v
```

### Manual Verification
- Test with `limit=1000` via Swagger UI.
- Verify through logs or debugging that radians are pre-calculated once per request.
