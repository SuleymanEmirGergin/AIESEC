# Implementation Plan: Comprehensive Backend Overhaul

Upgrade the search ecosystem with a robust failover mirror system, adaptive query selection (around vs bbox), and optimized 2-stage retrieval for industry-grade reliability and performance.

## User Review Required

> [!IMPORTANT]
> - **Failover State**: Circuit breaker state is in-memory and per-process. In multi-worker Docker environments, workers won't share mirror "health" status initially.
> - **Query Change**: We are switching to `nwr` shorthand and `out tags center`. This significantly reduces payload but requires parsing both `element.lat/lon` and `element.center.lat/lon`.
> - **Mode Auto**: The default search mode is now `auto`. Clients don't need to change anything to benefit from adaptive logic.

## Proposed Changes

### 🔧 1. Mirror System & Failover (`app/overpass.py`)
- **[NEW] `OverpassClient` class**:
    - Manage endpoint list from `OVERPASS_URLS`.
    - Implement Circuit Breaker (skip if 2 failures, cooldown 60s).
    - Thread-safe state with `threading.Lock`.
    - Automatic failover to next healthy mirror on transient error.

### 📐 2. Geo & BBox Math (`app/geo.py` [NEW])
- Implement `bbox_from_radius(lat, lon, radius_m)`.
- Implement `haversine_distance_m(lat1, lon1, lat2, lon2)` (centralized).

### ⚡ 3. Query Optimization (`app/overpass.py`)
- Use `nwr` shorthand across all query types.
- Switch to `out tags center;` for minimal payload.
- **Stage 1**: Force `["name"]`.
- **Stage 2**: Force `[!"name"]` and avoid `landuse=industrial`.

### 🧠 4. Adaptive Search & Orchestration (`app/routers/search.py`)
- **`auto` mode logic**:
    - Choice based on type (education=around, b2b=bbox).
    - Threshold: radius > 3000 => force bbox.
- **Automatic Fallback**: if first mode fails, retry with the other mode exactly once.
- **2-Stage Logic**:
    - Fetch Stage 1.
    - If results < MinThreshold (30 for B2B, 20 for School), fetch Stage 2.
    - Merge, Dedupe by `(osm_type, osm_id)`.
    - Apply strict post-filtering for unnamed (contact tags or binary object type tags).

### 🏷️ 5. Data Models & Tag Whitelisting (`app/models.py`)
- Update `Place` to whitelist tags: name, amenity, office, contact, address, website, etc.
- Store full tags only if `DEBUG_OVERPASS=true`.
- Clamp types and defaults for radius presets.

### 🍱 6. Radius Presets (`app/routers/presets.py` [NEW])
- Implement `GET /api/presets` returning default radii by type and max limits.

---

## Verification Plan

### Automated Tests
- `tests/test_failover.py`: Mock first endpoint failure, verify second is called.
- `tests/test_adaptive_search.py`: Verify `mode=auto` picks correct mode for education vs b2b.
- `tests/test_bbox_accuracy.py`: Verify bbox calculation and server-side radius filtering.
- `tests/test_two_stage_filtering.py`: Verify unnamed B2B items are discarded unless they have contact tags.

### Manual Verification
- Test with `OVERPASS_URLS` pointing to one fake and one real URL.
- Test `DEBUG_OVERPASS=true` and verify `X-Overpass-*` headers in response.
