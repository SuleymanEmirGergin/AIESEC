# Implementation Plan: Reference Point Distance Feature

Extend the search API to allow distance calculation and sorting from an optional reference point, while maintaining backward compatibility.

## User Review Required

> [!NOTE]
> `distance_m` field will only be present in the response when `ref_lat` and `ref_lon` are provided. Otherwise, the existing `distance` field (relative to search center) remains.

## Proposed Changes

### [Backend] Search API Extension

#### [MODIFY] [models.py](file:///C:/Users/emirg/Desktop/AIESEC/backend/app/models.py)
- Update `SearchParams` model to include `ref_lat: Optional[float]` and `ref_lon: Optional[float]`.
- Add `distance_m: Optional[float]` to `Place` model.

#### [MODIFY] [search.py](file:///C:/Users/emirg/Desktop/AIESEC/backend/app/routers/search.py)
- Update `search_places` endpoint to accept `ref_lat` and `ref_lon` as optional query parameters.
- Add logic to calculate distance from reference point if provided.
- If reference point is provided:
  - Populate `distance_m` for each result.
  - Sort results by `distance_m` (ascending).
- Maintain existing sorting by `distance` if reference point is absent.

---

## Verification Plan

### Automated Tests
- Create a new test suite `tests/test_ref_distance.py` (or add to `test_api.py`) to verify:
  1. **Backward Compatibility**: Requests without `ref_*` should not have `distance_m` and should sort by search center proximity.
  2. **Reference Point Sorting**: Requests with `ref_*` should have `distance_m` and MUST be sorted by it.
  3. **Parameter Validation**: Invalid `ref_lat`/`ref_lon` should return 422.

**Command:**
```bash
docker run --rm fastapi-osm-backend pytest tests/test_api.py -v
```

### Manual Verification
- Execute a search with `ref_lat` and `ref_lon` via Swagger UI (`/docs`).
- Confirm results are sorted by `distance_m`.
