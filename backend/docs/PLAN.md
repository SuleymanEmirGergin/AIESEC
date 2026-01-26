# PLAN: Backend Advanced Optimization (v1.2)

## Phase 1: Foundation (Database & Models)
- [ ] Update `APIKey` table with `plan` field (free, pro, enterprise).
- [ ] Update `Place` model with `confidence` (int) and `confidence_level` (str).
- [ ] Add `calculate_confidence` utility based on OSM tags and admin overrides.

## Phase 2: Core Logic (Caching & Gating)
- [ ] Implement grid quantization (2 decimal places) for location caching.
- [ ] Integrate optional Redis L2 cache if `REDIS_URL` is provided.
- [ ] Refactor `verify_api_key` to attach plan type to the request.
- [ ] Enforce plan rules:
  - Free: Radius <= 2000m, No CSV Export.
  - Pro/Ent: Full access.

## Phase 3: Background Services (Warmup)
- [ ] Implement `warmup.py` background service.
- [ ] Pre-cache results for Istanbul, Ankara, Izmir, Bursa, Kocaeli on startup.

## Phase 4: Verification
- [ ] Add unit tests for confidence math.
- [ ] Add integration tests for plan-based gating (expect 403).
- [ ] Verify grid cache hits for near-identical coordinates.
