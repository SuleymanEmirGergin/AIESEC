# Implementation Plan: 2-Stage Overpass Search Strategy

Enhance research quality and reduce timeouts by implementing a prioritized retrieval strategy: Fetch named objects first, and only fetch unnamed objects with strict filtering if needed.

## User Review Required

> [!NOTE]
> Stage 2 query will explicitly exclude named objects using `[!"name"]` to avoid redundant data transfer and backend processing.

## Proposed Changes

### [Backend] Overpass Enhancement

#### [MODIFY] [overpass.py](file:///C:/Users/emirg/Desktop/AIESEC/backend/app/overpass.py)
- Replace `build_query` with `build_overpass_query(type: str, lat: float, lon: float, radius: int, stage: int) -> str`.
- Implement stage 1: Add `["name"]` filter to all selectors.
- Implement stage 2: Add `[!"name"][!"official_name"]` filters to all selectors.
- Update `fetch_overpass`:
    - Read `OVERPASS_TIMEOUT` from environment (default 25).
    - Ensure it accepts an explicit `timeout` parameter.

#### [MODIFY] [search.py](file:///C:/Users/emirg/Desktop/AIESEC/backend/app/routers/search.py)
- Implement Orchestration Logic:
    - Execute Stage 1.
    - If results < threshold (30 for B2B, 20 for School), execute Stage 2.
- Implement `post_filter_unnamed(element: dict, type: str) -> bool`:
    - Discard if no contact info (phone/website) AND only broad tags.
    - Validate specific tags for B2B types (industrial, man_made, craft, office).
- Deduplicate merged results by `(osm_type, osm_id)`.
- Update response headers with debug metadata if `DEBUG_OVERPASS=true`.

---

## Verification Plan

### Automated Tests
- Create `tests/test_two_stage_search.py`:
    - Verify Stage 1 is always called.
    - Verify Stage 2 is only called when Stage 1 results are low.
    - Verify deduplication works.
    - Verify post-filtering for unnamed B2B objects.

### Manual Verification
- Test B2B search in areas with few named results to trigger Stage 2.
- Check headers for `X-Overpass-*` debug info.
