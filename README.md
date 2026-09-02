# Nearby Place Finder — Location Intelligence Platform

A full-stack location search platform for discovering nearby schools, factories, offices, and workshops using OpenStreetMap data.

Built as an AIESEC-oriented engineering project, the repository contains a **Next.js web client**, a **FastAPI search backend**, and an **Expo / React Native mobile client**.

## Why this project matters

The main engineering problem is not drawing markers on a map. It is making public geospatial data reliable enough for product use: selecting the right search strategy, handling unstable Overpass endpoints, normalizing results, applying distance-aware defaults, and exposing the same search capability to web and mobile clients.

## Architecture

```text
Web (Next.js) ───────┐
                     ├──> FastAPI Search API ──> OpenStreetMap / Overpass
Mobile (Expo / RN) ──┘           │
                                  ├── adaptive search policy
                                  ├── mirror failover / retry
                                  ├── pagination + validation
                                  └── Prometheus observability
```

## Stack

- **Web:** Next.js, TypeScript, Tailwind CSS, Leaflet
- **Backend:** Python, FastAPI, Pydantic, SQLAlchemy async, HTTPX
- **Mobile:** Expo, React Native, Expo Router, React Native Maps, Expo Location
- **Infrastructure:** Docker, Docker Compose
- **Observability & Quality:** Prometheus, Pytest, Ruff
- **Data:** OpenStreetMap / Overpass API

## Backend engineering highlights

- Adaptive **Around vs. Bounding Box** search strategy based on entity type and radius.
- Multi-endpoint Overpass **mirror failover** with retry-oriented behavior for transient failures.
- Two-stage retrieval that prioritizes named POIs while preserving valid unnamed results as fallback.
- Type-aware radius defaults for education and B2B place categories.
- Paginated search API with validation and explicit result normalization.
- Health probes, Prometheus metrics, and container-ready deployment.

### API

```http
GET /api/search?lat=41.015137&lon=28.979530&radius=2000&type=primary_school
```

Supported categories include kindergarten, primary/middle/high/private schools, colleges, factories, offices, and workshops.

## Mobile client

The `expo-osm-map/` package provides a dedicated mobile experience built with Expo and React Native. It uses device location and map-native UI rather than wrapping the web application.

## Repository structure

```text
AIESEC/
├── src/                 # Next.js web application
├── backend/             # FastAPI location-search service
│   ├── app/
│   ├── tests/
│   └── requirements.txt
├── expo-osm-map/        # Expo / React Native mobile client
├── docs/
├── Dockerfile
└── docker-compose.yml
```

## Run locally

### Full stack with Docker

```bash
docker compose up --build
```

### Backend only

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Mobile

```bash
cd expo-osm-map
npm install
npm start
```

## What I would discuss in an interview

- Why proximity search behaves differently for dense schools vs. large industrial areas.
- How I handle unreliable third-party geospatial infrastructure without silently returning poor results.
- Trade-offs between web map rendering and a native mobile map experience.
- How search policy, validation, failover, and observability make a map feature production-lean rather than demo-only.
