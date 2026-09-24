# FastAPI OSM Backend

Production-lean MVP backend for location-based place search using OpenStreetMap Overpass API. Provides REST endpoint for finding schools (by level) and B2B locations (factories, offices, workshops) near a given coordinate.

## 🎯 Features

- **School Search**: Kindergarten to college levels with Turkish heuristics
- **B2B Search**: Industrial facilities, offices, and workshops
- **Search Policy Engine**: Centralized adaptive strategy (Around vs BBox) and radius defaults
- **Mirror Failover**: Multi-endpoint support with circuit breaker
- **Adaptive Search**: `auto` selection with intelligent Around/BBox switching
- **2-Stage Retrieval**: Quality-first named retrieval with valid-unnamed fallback
- **Radius Presets**: Type-intelligent distance defaults (e.g. 1km Kindergarten)
- **Pagination**: Scalable results via `limit` (up to 1000) and `offset`
- **Full Observability**: Prometheus metrics, health probes, and debug headers
- **Docker Ready**: Full containerization with multi-stage builds and health checks

---

## 🛡️ Search Policy Engine

The backend utilizes a smart **Search Policy Engine** (`app/policy.py`) to determine the best technical strategy for every request.

### Adaptive Mode Selection (`mode=auto`)
| Scenario | Effective Mode | Reason |
|----------|----------------|--------|
| Type is School (Education) | `around` | High density, point-based proximity focus |
| Type is B2B | `bbox` | Better performance for large industrial zones |
| Radius > 3000m | `bbox` | Overpass stability at scale |
| Explicit Choice | User Choice | Respects `mode=around` or `mode=bbox` |

### Default Radius Presets
If `radius` is missing or `<=0`, the policy applies:
- `factory`: 5000m
- `workshop`: 3000m
- `high_school`/`private_school`: 2500m
- `office`/`middle_school`: 2000m
- `primary_school`: 1500m
- `kindergarten`: 1000m

### Fallback Orchestration
Each search allows **at most 2 attempts**. If the effective mode (e.g., `around`) encounters a transient Overpass error (timeout, high load), the engine automatically falls back to the alternative mode (e.g., `bbox`) before returning an error to the client.


## 🚀 Quick Start

### Local Development

```bash
# Clone repository
cd backend

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env

# Run server (--env-file is required: most settings are read from os.environ, which never loads .env itself)
uvicorn app.main:app --reload --env-file .env

# API available at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### Docker Deployment

```bash
# Build and run
docker-compose up -d

# Check health
curl http://localhost:8000/health

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

## 📡 API Documentation

### Endpoint

```
GET /api/search
```

### Parameters

| Parameter | Type | Required | Default | Range | Description |
|-----------|------|----------|---------|-------|-------------|
| `lat` | float | ✅ | - | -90 to 90 | Latitude of search center |
| `lon` | float | ✅ | - | -180 to 180 | Longitude of search center |
| `radius` | int | ❌ | 1500 | 100-5000 | Search radius in meters |
| `type` | string | ✅ | - | See below | Type of place to search |

### Supported Types

**Schools:**
- `kindergarten` - Kindergartens (anaokulu/kreş)
- `primary_school` - Primary schools (ilkokul)
- `middle_school` - Middle schools (ortaokul)
- `high_school` - High schools (lise)
- `private_school` - Private schools (özel okul)
- `college_keyword` - Schools with "kolej/college" in name

**B2B:**
- `factory` - Industrial facilities
- `office` - Office buildings
- `workshop` - Craft workshops

### Response Format

```json
[
  {
    "id": "osm:node:123456",
    "name": "Atatürk İlkokulu",
    "type": "primary_school",
    "lat": 41.0151,
    "lon": 28.9795,
    "address": {
      "street": "Cumhuriyet Caddesi",
      "housenumber": "42",
      "city": "Istanbul",
      "country": "Turkey"
    },
    "tags": {
      "amenity": "school",
      "name": "Atatürk İlkokulu",
      "isced:level": "1"
    },
    "source": "osm_overpass",
    "distance": 342.5,
    "unnamed": null
  }
]
```

### Example Requests

#### Kindergartens
```bash
curl "http://localhost:8000/api/search?lat=41.015137&lon=28.979530&radius=1500&type=kindergarten"
```

#### Primary Schools
```bash
curl "http://localhost:8000/api/search?lat=41.015137&lon=28.979530&radius=2000&type=primary_school"
```

#### Middle Schools
```bash
curl "http://localhost:8000/api/search?lat=41.015137&lon=28.979530&radius=2000&type=middle_school"
```

#### High Schools
```bash
curl "http://localhost:8000/api/search?lat=41.015137&lon=28.979530&radius=2500&type=high_school"
```

#### Private Schools
```bash
curl "http://localhost:8000/api/search?lat=41.015137&lon=28.979530&radius=2000&type=private_school"
```

#### College Keyword Schools
```bash
curl "http://localhost:8000/api/search?lat=41.015137&lon=28.979530&radius=2500&type=college_keyword"
```

#### Factories
```bash
curl "http://localhost:8000/api/search?lat=41.015137&lon=28.979530&radius=3000&type=factory"
```

#### Offices
```bash
curl "http://localhost:8000/api/search?lat=41.015137&lon=28.979530&radius=1500&type=office"
```

#### Workshops
```bash
curl "http://localhost:8000/api/search?lat=41.015137&lon=28.979530&radius=2000&type=workshop"
```

### Error Responses

| Status | Description |
|--------|-------------|
| `400` | Invalid parameters (latitude/longitude out of range, invalid type, radius out of bounds) |
| `422` | Validation error (missing required fields) |
| `429` | Rate limit exceeded (60 requests/minute) |
| `502` | Overpass API failure after retries |

## 🧠 Classification Logic

### School Level Detection

**Priority Order:**
1. **ISCED/Education Tags** (highest priority)
   - `isced:level`: 0 = kindergarten, 1 = primary, 2 = middle, 3 = high
   - `school:level`: "primary", "middle", "secondary"

2. **Name-based Heuristics** (Turkish-focused)
   - **College Keyword**: "kolej", "koleji", "college"
   - **Private School**: "özel", "private" (or operator tags)
   - **Primary**: "ilkokul", "primary"
   - **Middle**: "ortaokul", "middle school"
   - **High**: "lise", "anadolu lisesi", "fen lisesi", "mesleki", "vocational"

**Edge Cases:**
- Multiple keywords → Uses priority (primary > middle > high)
- Tags override name (e.g., ISCED says "middle" but name says "high" → returns "middle")
- Case-insensitive with Turkish casefold (İ → i)

### B2B Type Detection

**Factory Indicators:**
- `industrial=*`
- `man_made=works`
- `building=industrial`
- `landuse=industrial`

**Office Indicators:**
- `office=*`
- `building=commercial`

**Workshop Indicators:**
- `craft=*`
- `industrial=workshop`

**Unnamed Places:**
- B2B places without `name` tag are included with `"unnamed": true` flag
- Helps identify industrial zones but may include noise

## 🔧 Configuration

Environment variables (`.env`):

```env
PORT=8000
HOST=0.0.0.0
OVERPASS_URL=https://overpass-api.de/api/interpreter
OVERPASS_TIMEOUT=15
RATE_LIMIT=60/minute
CACHE_TTL_SCHOOL=3600
CACHE_TTL_B2B=300
LOG_LEVEL=INFO
```

## 🧪 Testing

```bash
# Install dev dependencies
pip install -r requirements.txt

# Run all tests
pytest tests/ -v

# With coverage
pytest tests/ --cov=app --cov-report=term-missing

# Run specific test file
pytest tests/test_classify.py -v
```

## ⚠️ Limitations & Known Issues

### OSM Data Quality
- **School Classification Accuracy**: Depends on Turkish naming conventions. International schools or non-standard names may be misclassified or return `None`.
- **ISCED Tag Coverage**: Not all schools have ISCED tags in Turkey. Name-based heuristics fill the gap but may have false positives.
- **B2B Unnamed Places**: Industrial/commercial areas without names may create noise. Use `unnamed` flag to filter.

### Performance
- **Cold Start Latency**: First request per location takes 2-3 seconds (Overpass query time).
- **Cache Effectiveness**: Cache hit rate improves with repeated searches in same area. Different radius invalidates cache.
- **Overpass Load**: Heavy usage may hit Overpass API rate limits. Consider self-hosted Overpass instance for production.

### Heuristics Limitations
- **Turkish-Focused**: Keywords like "ilkokul", "ortaokul" work for Turkey. Other languages need separate logic.
- **Ambiguous Names**: "Özel İlkokul Ortaokul Lisesi" (contains all levels) uses priority system - may not always match user intent.
- **College Keyword**: "Kolej" in Turkey often refers to private K-12 schools, not higher education. Name reflects this nuance.

### Retry Strategy
- **15-Second Max**: After 3 retries with backoff (1s, 2s, 4s), request fails with 502.
- **No Stale Cache Fallback**: On Overpass failure, returns error instead of stale data. Can be changed based on requirements.

## 📚 Tech Stack

- **FastAPI 0.115+**: Modern async framework
- **Pydantic v2**: Request/response validation
- **httpx**: Async HTTP client for Overpass
- **slowapi**: Rate limiting middleware
- **pytest**: Testing framework
- **Docker**: Containerization

## 🛠️ Advanced Features

### Pagination

All search requests now return a paginated response:

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

**Customizing Pagination:**
```bash
# Get 50 results starting from 10th
curl "http://localhost:8000/api/search?lat=...&lon=...&type=...&limit=50&offset=10"
```

### Administrative API

Protected by `ADMIN_API_KEY` (Bearer Token).

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/admin/cache/stats` | Detailed cache performance metrics |
| `DELETE` | `/admin/cache` | Clear all entries from in-memory cache |
| `GET` | `/admin/ui` | Web-based admin dashboard |

### Monitoring & Health

- **Prometheus Metrics**: `/metrics`
- **Liveness Probe**: `/health/live`
- **Readiness Probe**: `/health/ready` (checks Overpass connectivity)
- **Startup Probe**: `/health/startup`

## 🔐 Security

- **No Hardcoded Secrets**: All config via environment variables
- **CORS**: Enabled for all origins (change for production)
- **Rate Limiting**: 60 req/min per IP (prevents abuse)
- **Input Validation**: Pydantic models validate all inputs
- **No SQL Injection**: No database, no SQL

## 🛠️ Development

### Code Quality

```bash
# Linting
ruff check app/

# Type checking (optional)
pip install mypy
mypy app/
```

### Project Structure

```
backend/
├── app/
│   ├── __init__.py          # Package init
│   ├── main.py              # FastAPI app + CORS + rate limiter
│   ├── api.py               # Search endpoint
│   ├── models.py            # Pydantic models
│   ├── overpass.py          # Overpass query builder + HTTP
│   ├── classify.py          # School + B2B classification
│   └── cache.py             # TTL cache implementation
├── tests/
│   ├── test_classify.py     # Classification unit tests
│   └── test_api.py          # API integration tests
├── requirements.txt         # Dependencies
├── Dockerfile              # Container build
├── docker-compose.yml      # Orchestration
└── README.md               # This file
```

## 📈 Roadmap (Future Enhancements)

- [ ] Redis cache for distributed deployments
- [ ] Prometheus metrics endpoint
- [ ] Pagination for large result sets
- [ ] Multi-language keyword support (English, Arabic, etc.)
- [ ] Self-hosted Overpass instance for reliability
- [ ] GraphQL API option
- [ ] Admin panel for cache management

## 📄 License

MIT License - Use freely for commercial and personal projects.

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 💬 Support

For issues, questions, or feature requests, open an issue on GitHub.

---

**Built with ❤️ using OpenStreetMap data**
