# FastAPI OSM Backend - Enhancement Plan

## 🎯 Overview

Mevcut MVP backend'e 5 production-grade özellik ekleniyor:
1. **Pagination** - Büyük sonuç setleri için limit/offset
2. **Cache Management** - Admin cache clear endpoints
3. **Prometheus Metrics** - Monitoring ve alerting
4. **Admin Panel** - Web-based yönetim arayüzü
5. **Health Checks** - Advanced liveness/readiness probes

---

## 📋 Feature Breakdown

### Feature 1: Pagination

**Problem:** 100 sonuç limiti sabit, kullanıcı kontrol edemiyor.

**Solution:**
```python
GET /api/search?lat=...&lon=...&type=...&limit=20&offset=0
```

**Changes:**
- `SearchParams` model'e `limit` (default=20, max=100) ve `offset` (default=0) ekle
- Response'a pagination metadata ekle:
  ```json
  {
    "results": [...],
    "pagination": {
      "limit": 20,
      "offset": 0,
      "total": 85,
      "has_more": true
    }
  }
  ```
- Cache key'e pagination parametrelerini ekle

**Files to Modify:**
- `app/models.py` - SearchParams + PaginatedResponse
- `app/api.py` - Pagination logic
- `app/cache.py` - Cache key format

**Tests:**
- Limit validation (1-100)
- Offset validation (>=0)
- has_more flag accuracy

**Effort:** 1 saat

---

### Feature 2: Cache Management Endpoints

**Problem:** Stale cache'i temizlemek için container restart gerekiyor.

**Solution:**
```python
DELETE /admin/cache                     # Clear all cache
DELETE /admin/cache/{cache_key}         # Clear specific key
GET /admin/cache/stats                  # Cache statistics
```

**Security:** API key authentication
```
Authorization: Bearer {ADMIN_API_KEY}
```

**Cache Stats Response:**
```json
{
  "total_entries": 42,
  "expired_entries": 5,
  "total_size_bytes": 15360,
  "hit_rate": 0.73,
  "uptime_seconds": 3600
}
```

**Changes:**
- Yeni router: `app/routers/admin.py`
- Environment variable: `ADMIN_API_KEY`
- Cache'e `get_stats()` metodu ekle
- Dependency: `verify_admin_token()`

**Files to Create:**
- `app/routers/admin.py`
- `app/auth.py` - Admin token verification
- `tests/test_admin.py`

**Files to Modify:**
- `app/main.py` - Admin router include
- `app/cache.py` - Stats tracking
- `.env.example` - ADMIN_API_KEY

**Tests:**
- Unauthorized access returns 401
- Valid token clears cache
- Stats accuracy

**Effort:** 1.5 saat

---

### Feature 3: Prometheus Metrics

**Problem:** Production'da performance monitoring yok.

**Solution:** Prometheus formatted metrics endpoint
```
GET /metrics
```

**Metrics to Track:**
- `http_requests_total` - Counter (by endpoint, status)
- `http_request_duration_seconds` - Histogram
- `cache_hits_total` - Counter
- `cache_misses_total` - Counter
- `overpass_requests_total` - Counter
- `overpass_failures_total` - Counter

**Integration:**
```python
from prometheus_client import Counter, Histogram, generate_latest

request_counter = Counter('http_requests_total', 'Total requests', ['method', 'endpoint', 'status'])
request_duration = Histogram('http_request_duration_seconds', 'Request duration')
```

**Middleware:** Auto-track all requests

**Changes:**
- Dependency: `prometheus-client==0.21.1`
- Middleware: `app/middleware/metrics.py`
- Endpoint: `app/routers/metrics.py`
- Cache instrumentation

**Files to Create:**
- `app/middleware/metrics.py`
- `app/routers/metrics.py`
- `tests/test_metrics.py`

**Files to Modify:**
- `app/main.py` - Middleware registration
- `app/cache.py` - Hit/miss tracking
- `requirements.txt`

**Grafana Dashboard:** JSON export (opsiyonel)

**Tests:**
- Metrics endpoint returns valid Prometheus format
- Counters increment correctly
- Histogram records durations

**Effort:** 2 saat

---

### Feature 4: Admin Panel (Simple Web UI)

**Problem:** Cache yönetimi için komut satırı gerekiyor.

**Solution:** Minimal web UI (single-page HTML + vanilla JS)

**Features:**
- Cache stats dashboard
- Clear cache button
- Recent requests log
- Health status

**Tech Stack:**
- No framework (vanilla HTML/CSS/JS)
- Served as static file from FastAPI
- Uses admin API endpoints

**Layout:**
```
┌─────────────────────────────────────┐
│ FastAPI OSM Backend - Admin Panel  │
├─────────────────────────────────────┤
│ Cache Stats                         │
│ - Total Entries: 42                 │
│ - Hit Rate: 73%                     │
│ - Uptime: 1h 23m                    │
│ [Clear Cache]                       │
├─────────────────────────────────────┤
│ Recent Requests (Last 10)           │
│ 1. GET /api/search?type=factory     │
│ 2. GET /api/search?type=kindergarten│
└─────────────────────────────────────┘
```

**Changes:**
- Static directory: `app/static/`
- HTML: `app/static/admin.html`
- CSS: Inline (minimal)
- JS: Fetch API to call admin endpoints

**Files to Create:**
- `app/static/admin.html`
- `tests/test_admin_ui.py` (basic rendering)

**Files to Modify:**
- `app/main.py` - Mount static files
- `Dockerfile` - Include static files

**Security:** Same API key auth via prompt

**Effort:** 2 saat

---

### Feature 5: Advanced Health Checks

**Problem:** `/health` sadece "ok" döndürüyor, Kubernetes readiness/liveness için yetersiz.

**Solution:**
```python
GET /health/live       # Liveness (process alive)
GET /health/ready      # Readiness (dependencies OK)
GET /health/startup    # Startup (initialization complete)
```

**Readiness Checks:**
- Overpass API reachable (test query)
- Cache functional
- Memory usage < 80%

**Response Format:**
```json
{
  "status": "healthy",
  "checks": {
    "overpass": {"status": "pass", "latency_ms": 234},
    "cache": {"status": "pass"},
    "memory": {"status": "pass", "usage_percent": 45}
  },
  "timestamp": "2026-01-26T00:55:00Z"
}
```

**Changes:**
- Router: `app/routers/health.py`
- Dependency checks as functions
- Async health probe logic

**Files to Create:**
- `app/routers/health.py`
- `tests/test_health.py`

**Files to Modify:**
- `app/main.py` - Remove old /health, include new router
- `docker-compose.yml` - Update health check command

**Kubernetes Integration:**
```yaml
livenessProbe:
  httpGet:
    path: /health/live
readinessProbe:
  httpGet:
    path: /health/ready
```

**Effort:** 1.5 saat

---

## 🗂️ Implementation Order

| Phase | Feature | Priority | Dependencies | Effort |
|-------|---------|----------|--------------|--------|
| **1** | Pagination | P1 | None | 1h |
| **2** | Cache Management | P1 | None | 1.5h |
| **3** | Prometheus Metrics | P2 | None | 2h |
| **4** | Advanced Health Checks | P2 | None | 1.5h |
| **5** | Admin Panel | P3 | Cache Management | 2h |

**Total Effort:** ~8 saat

**Incremental Deployment:** Her feature merge edilebilir, all-or-nothing değil.

---

## 📊 Task Checklist

### Phase 1: Pagination
- [ ] Update `SearchParams` model with `limit` and `offset`
- [ ] Create `PaginatedResponse` model
- [ ] Modify `/api/search` to use pagination
- [ ] Update cache key builder
- [ ] Add pagination tests
- [ ] Update README with pagination examples

### Phase 2: Cache Management
- [ ] Create `app/auth.py` with admin token verification
- [ ] Create `app/routers/admin.py` with cache endpoints
- [ ] Add `get_stats()` to `TtlCache`
- [ ] Add `ADMIN_API_KEY` to `.env.example`
- [ ] Include admin router in `main.py`
- [ ] Add admin endpoint tests
- [ ] Update README with admin API docs

### Phase 3: Prometheus Metrics
- [ ] Add `prometheus-client` to requirements
- [ ] Create `app/middleware/metrics.py`
- [ ] Create `app/routers/metrics.py`
- [ ] Instrument cache with hit/miss counters
- [ ] Add middleware to `main.py`
- [ ] Add metrics tests
- [ ] Create example Grafana dashboard JSON
- [ ] Update README with metrics docs

### Phase 4: Advanced Health Checks
- [ ] Create `app/routers/health.py` with 3 endpoints
- [ ] Implement Overpass reachability check
- [ ] Implement memory usage check
- [ ] Remove old `/health` from `main.py`
- [ ] Update `docker-compose.yml` health check
- [ ] Add health check tests
- [ ] Update README with Kubernetes examples

### Phase 5: Admin Panel
- [ ] Create `app/static/admin.html`
- [ ] Implement cache stats display
- [ ] Add clear cache button
- [ ] Add recent requests log (optional)
- [ ] Mount static files in `main.py`
- [ ] Update `Dockerfile` to include static files
- [ ] Add admin UI tests (basic)
- [ ] Update README with admin panel access

---

## 🔐 Security Considerations

### Admin API Key
```bash
# Generate secure key
python -c "import secrets; print(secrets.token_urlsafe(32))"

# Set in .env
ADMIN_API_KEY=your-secure-key-here
```

### Rate Limiting
- Admin endpoints: 10 req/min (stricter)
- Metrics endpoint: No limit (Prometheus scraper)

### CORS
- Metrics: Allow Prometheus origin
- Admin panel: Same-origin only

---

## 📈 Monitoring Setup (Post-Implementation)

### Prometheus Configuration
```yaml
scrape_configs:
  - job_name: 'fastapi-osm'
    static_configs:
      - targets: ['backend:8000']
    metrics_path: '/metrics'
    scrape_interval: 15s
```

### Grafana Alerts
```yaml
- alert: HighCacheMissRate
  expr: rate(cache_misses_total[5m]) / rate(cache_hits_total[5m]) > 0.5
  for: 10m
  annotations:
    summary: "Cache miss rate above 50%"
```

---

## 🧪 Verification Plan

### After Each Feature
1. Unit tests pass (`pytest tests/ -v`)
2. Integration tests pass
3. Docker build succeeds
4. Manual API test
5. Update documentation

### Final Verification
- [ ] All 5 features working
- [ ] Docker build < 60s
- [ ] Image size < 250MB
- [ ] All tests passing
- [ ] README updated
- [ ] Security scan clean

---

## 📝 Breaking Changes

**None** - All features are additive:
- Pagination is optional (defaults to old behavior)
- Admin endpoints require new auth
- Metrics endpoint is new
- Health endpoints deprecate old `/health` (backward compatible)
- Admin panel is optional

---

## 🚀 Deployment Strategy

### Feature Flags (Optional)
```env
ENABLE_PAGINATION=true
ENABLE_ADMIN_API=true
ENABLE_METRICS=true
ENABLE_ADMIN_PANEL=true
```

### Rolling Deployment
1. Deploy with pagination
2. Test in staging
3. Deploy with cache management
4. Deploy with metrics
5. Configure Prometheus/Grafana
6. Deploy with admin panel

---

**Ready to start implementation? Hangi feature ile başlamak istersin?**

1. Pagination (en basit, hemen değer katar)
2. Cache Management (admin için kritik)
3. Prometheus Metrics (monitoring için)
4. Advanced Health Checks (Kubernetes için)
5. Admin Panel (UI için)
