# CI ve Test Sağlığı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Her PR'da backend ve frontend kalite kontrollerini çalıştırmak; ilçe istemcisi testlerini gerçek API sözleşmesiyle hizalamak.

**Architecture:** GitHub Actions iki bağımsız job ile Python ve Node kontrollerini paralel çalıştırır. Frontend testleri `districts.ts`'in açık istemci arayüzünü doğrular; kaydedilen yer istemcisi HTTP hata ve kimlik başlığı davranışını izole eder. Backend'de var olan saved-place davranış testleri korunur ve kapsam eşiği %79'da sabitlenir.

**Tech Stack:** GitHub Actions, Python 3.12, pytest/pytest-cov, Ruff, Node 20, pnpm 8.15.4, Next.js ESLint, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-15-ci-ve-test-sagligi-design.md`

## Global Constraints

- CI `pull_request` için tüm dallarda, `push` için yalnız `main` dalında çalışır.
- Backend eşiği `pytest --cov --cov-fail-under=79`; frontend için kapsam eşiği eklenmez.
- CI hiçbir secret, Redis veya dış ağ hizmetine ihtiyaç duymaz.
- `districts.test.ts` içinde `skipIf`, `T15` ya da `BULGU` devir teslim notu kalmaz.
- `PROVINCES` ve `triggerDistrictIngest` testleri silinir; ikinci bir doğruluk kaynağı veya arayüzü olmayan ingest istemcisi eklenmez.

---

### Task 1: İlçe istemcisini test edilebilir sözleşmeye hizala

**Files:**
- Modify: `src/lib/districts.ts`
- Modify: `src/lib/districts.test.ts`

**Interfaces:**
- Produces: `buildPlacesParams(query: PlaceQuery): URLSearchParams`.
- Preserves: `fetchDistrictPlaces(districtId, query?, signal?)` and `fetchDistrictSummary(districtId, includeBuffer?, signal?)`.

- [ ] **Step 1: Eksik dışa açık parametre kurucu testi yaz**

`districts.test.ts` içinden namespace import, `skipIf` blokları ve `PROVINCES`/ingest testlerini kaldır. `buildPlacesParams` doğrudan import edilsin ve boş, tür, boolean, metin, sıralama/sayfalama senaryoları aynen koşsun.

- [ ] **Step 2: RED'i doğrula**

Run: `pnpm test -- src/lib/districts.test.ts`

Expected: `buildPlacesParams` export edilmediği için test dosyası başarısız olur.

- [ ] **Step 3: URL ve abort sözleşmesi için testleri düzelt**

`fetchDistrictPlaces("tr-34-a b", {})` çağrısının `%20` içeren URL'ye gittiğini; `fetchDistrictPlaces("tr-34-kadikoy", {}, controller.signal)` çağrısının doğrudan `signal` taşıdığını test et. Önbellekli `fetchDistricts` hata senaryosunu `vi.resetModules()` ve yeniden import ile izole et.

- [ ] **Step 4: Minimal istemci değişikliğini yap**

`buildQuery` yerine aşağıdaki imzayı kullan ve çağıranlarda yalnızca boş olmayan parametreler için `?${params}` ekle:

```ts
export function buildPlacesParams(query: PlaceQuery): URLSearchParams {
  const params = new URLSearchParams();
  // mevcut parametre kuralları burada korunur
  return params;
}
```

Hem `/places` hem `/summary` yolundaki `districtId` için `encodeURIComponent(districtId)` uygula. Öksüz Türkçe katlama yorumunu `foldTr` fonksiyonunun hemen üstüne taşı.

- [ ] **Step 5: GREEN'i doğrula ve commit et**

Run: `pnpm test -- src/lib/districts.test.ts`

Expected: tüm testler geçer, `skipped` sayısı 0'dır.

```bash
git add src/lib/districts.ts src/lib/districts.test.ts
git commit -m "test: ilce istemcisi sozlesmesini hizala"
```

### Task 2: Kaydedilen yer istemcisine birim testi ekle

**Files:**
- Create: `src/lib/savedApi.test.ts`
- Modify: `src/lib/savedApi.ts` (yalnız test edilebilir dışa aktarımlar gerekirse)

**Interfaces:**
- Consumes: `savedToPlace(saved: SavedPlace): Place`, `fetchLists()`, `fetchSavedPlaces()`.
- Verifies: hata gövdesindeki `message`, `X-API-KEY` başlığı, saf veri dönüşümü.

- [ ] **Step 1: Başarısız HTTP yanıtı için test yaz**

`fetchLists()` çağrısında sahte `fetch` 422 ve `{ message: "Liste okunamadı." }` döndürsün; çağrının aynı mesajla reddedildiğini bekle.

- [ ] **Step 2: RED'i doğrula**

Run: `pnpm test -- src/lib/savedApi.test.ts`

Expected: test dosyası henüz bulunamadığı için başarısız olur.

- [ ] **Step 3: Kimlik başlığı ve dönüşüm testlerini ekle**

`localStorage`da anahtar varken `fetchSavedPlaces()` çağrısının `X-API-KEY` göndermesini, yokken başlığın bulunmamasını test et. Bir `SavedPlace` örneğinin `savedToPlace` ile id, ad, koordinatlar, adres ve etiketlerini doğru `Place`e çevirdiğini test et.

- [ ] **Step 4: Gerekirse minimal dışa aktarımı yap**

Test edilen dönüşüm zaten dışa açık değilse `savedToPlace` fonksiyonunu dışa aç; istek davranışını değiştirme.

- [ ] **Step 5: GREEN'i doğrula ve commit et**

Run: `pnpm test -- src/lib/savedApi.test.ts`

Expected: tüm yeni testler geçer.

```bash
git add src/lib/savedApi.ts src/lib/savedApi.test.ts
git commit -m "test: kayitli yer istemcisini kapsa"
```

### Task 3: CI ve ESLint yapılandırmasını ekle

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.eslintrc.json`

**Interfaces:**
- Backend job: Python 3.12, `ruff check .`, `pytest --cov --cov-fail-under=79`, çalışma dizini `backend`.
- Frontend job: Node 20, pnpm 8.15.4, `pnpm install --frozen-lockfile`, `pnpm type-check`, `pnpm lint`, `pnpm test`.

- [ ] **Step 1: ESLint yapılandırmasını ekle**

`.eslintrc.json` içine aşağıdakini yaz:

```json
{ "extends": ["next/core-web-vitals"] }
```

- [ ] **Step 2: Lint ve frontend kalite komutlarını doğrula**

Run: `pnpm type-check; pnpm lint; pnpm test`

Expected: hata yok; mevcut özel font kuralı uyarı olarak kalabilir.

- [ ] **Step 3: GitHub Actions workflow'unu ekle**

`pull_request` ve `push: branches: [main]` tetikleyicileriyle paralel `backend` ve `frontend` jobları oluştur. Her job kendi bağımlılığını yukarıdaki sabit sürüm ve komutlarla kursun.

- [ ] **Step 4: Backend kalite komutlarını doğrula**

Run: `backend/.venv/Scripts/python.exe -m ruff check backend; backend/.venv/Scripts/python.exe -m pytest backend --cov --cov-fail-under=79 -q`

Expected: lint temiz, testler yeşil ve toplam kapsam en az %79.

- [ ] **Step 5: Workflow sözdizimini ve tüm paketi doğrula; commit et**

Run: `git diff --check; pnpm type-check; pnpm lint; pnpm test; backend/.venv/Scripts/python.exe -m ruff check backend; backend/.venv/Scripts/python.exe -m pytest backend --cov --cov-fail-under=79 -q`

Expected: tüm komutlar sıfır hata ile tamamlanır.

```bash
git add .github/workflows/ci.yml .eslintrc.json
git commit -m "ci: test ve kalite kontrollerini ekle"
```
