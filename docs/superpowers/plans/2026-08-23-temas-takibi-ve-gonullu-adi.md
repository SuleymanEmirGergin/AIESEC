# Temas Takibi ve Gönüllü Adı Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ekibin kaydettiği yerlerde gönüllü adıyla izlenebilir temas geçmişi ve vadesi gelen takip listesi sunmak.

**Architecture:** Ekip sınırı mevcut API anahtarıdır; cihazda tutulan gönüllü adı yalnızca kaydeden bilgisidir. `saved_places` güncel temas özetini, yeni `contact_events` tablosu değiştirilemez olay geçmişini tutar. Next.js proxy gönüllü adını izinli başlık olarak aktarır; `/kayitli` sayfası vadesi gelenleri bellekteki kayıtlardan türetir.

**Tech Stack:** Next.js 14, React 18, TypeScript, Vitest + Testing Library, FastAPI, Pydantic v2, SQLAlchemy async, SQLite, pytest.

**Spec:** `docs/superpowers/specs/2026-08-23-temas-takibi-ve-gonullu-adi-design.md`

## Global Constraints

- Hesap sistemi, bildirim, e-posta veya geçmiş olayını düzenleme/silme eklemeyin.
- Yetki yalnızca `X-API-KEY` ile belirlenir; `X-VOLUNTEER-NAME` yetki vermez.
- Yazma eyleminde gönüllü adı kırpılmış, boş olmayan ve en fazla 120 karakter olmalıdır; aksi 422’dir.
- Durum kodları: `uncontacted`, `preparing`, `contacted`, `follow_up`, `positive`, `not_suitable`.
- Eski yerler `uncontacted`, boş son temas/follow-up ve boş geçmişle çalışmalıdır.
- Liste silme yerleri ve olayları korur; yer silme olaylarını da siler.
- Backend `ruff check .` ve `pytest --cov --cov-fail-under=79 -q`; frontend `pnpm type-check`, `pnpm lint`, `pnpm test` ile doğrulanır.

---

## File Structure

- `backend/app/database.py`: temas özeti sütunları, `ContactEvent` ve migration.
- `backend/app/models.py`: durum, olay ve genişletilmiş kayıt şemaları.
- `backend/app/routers/saved.py`: gönüllü adı, temas uçları ve silme.
- `backend/tests/test_saved_places.py`: backend regresyonları.
- `src/server/backend.ts`: izinli gönüllü adı başlığı.
- `src/lib/savedApi.ts` / `.test.ts`: istemci sözleşmesi ve testleri.
- `src/lib/contactTracking.ts` / `.test.ts`: saf durum/takip zamanı fonksiyonları.
- `src/components/SettingsModal.tsx` / `.test.tsx`: cihazdaki gönüllü adı.
- `src/components/SavedPlaceRow.tsx`: durum, form ve açılır geçmiş.
- `src/app/kayitli/page.tsx`: takip zamanı ve temas akışı.

### Task 1: Kalıcı temas modelini ve migration’ı ekle

**Files:**

- Modify: `backend/app/database.py:136-190,269-294`
- Modify: `backend/app/models.py:446-490`
- Test: `backend/tests/test_saved_places.py`

**Interfaces:**

- Produces: `ContactStatus`, `ContactEventCreate`, `ContactEventResponse` ve üç yeni `SavedPlaceResponse` alanı.
- Produces: `SavedPlace.contact_status`, `last_contact_at`, `next_follow_up_at` ve `ContactEvent`.
- Consumed by: Task 2 backend uçları, Task 3 istemci türleri.

- [ ] **Step 1: Kırmızı model/migration testlerini yaz**

```python
def test_new_saved_place_has_contact_defaults(client):
    saved = client.post("/api/saved", json=_place("osm:node:contact-default")).json()
    assert saved["contact_status"] == "uncontacted"
    assert saved["last_contact_at"] is None
    assert saved["next_follow_up_at"] is None
```

`init_db()` sonrasında `PRAGMA table_info(saved_places)` çıktısında üç yeni
sütunu doğrulayan ayrı bir test de ekleyin. Test veritabanında tablo zaten
varsa migration’ın ikinci kez de hata vermediğini doğrulayın.

- [ ] **Step 2: Testin kırmızı olduğunu doğrula**

Run: `cd backend; pytest tests/test_saved_places.py -q`

Expected: `contact_status` alanı yokken FAIL.

- [ ] **Step 3: Minimal ORM, şema ve migration’ı yaz**

```python
class ContactEvent(Base):
    __tablename__ = "contact_events"
    id = Column(String, primary_key=True)
    saved_place_id = Column(String, ForeignKey("saved_places.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String, nullable=False)
    contacted_at = Column(Date, nullable=False)
    note = Column(String, nullable=True)
    next_follow_up_at = Column(Date, nullable=True)
    volunteer_name = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.datetime.utcnow)
```

`SavedPlace`a `contact_status` (varsayılan `uncontacted`) ile nullable
`last_contact_at` ve `next_follow_up_at` `Date` alanlarını ekleyin.
`init_db`de `PRAGMA table_info(saved_places)` sonucunu alın; yalnızca eksik
alanlara aşağıdaki SQL’yi çalıştırın:

```sql
ALTER TABLE saved_places ADD COLUMN contact_status TEXT NOT NULL DEFAULT 'uncontacted';
ALTER TABLE saved_places ADD COLUMN last_contact_at DATE;
ALTER TABLE saved_places ADD COLUMN next_follow_up_at DATE;
```

Pydantic modellerinde `date` kullanın. `ContactStatus` bir string enum olsun;
`ContactEventCreate` durum, temas tarihi, en fazla 1000 karakter not ve
isteğe bağlı takip tarihini; `ContactEventResponse` ise tüm kalıcı olay
alanlarını taşısın. Üç özet alanını `SavedPlaceResponse`a ekleyin.

- [ ] **Step 4: Model testini yeşile getir**

Run: `cd backend; ruff format app/database.py app/models.py tests/test_saved_places.py; ruff check app/database.py app/models.py tests/test_saved_places.py; pytest tests/test_saved_places.py -q`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/database.py backend/app/models.py backend/tests/test_saved_places.py
git commit -m "feat: temas takip veri modelini ekle"
```

### Task 2: Gönüllü adı ve temas geçmişi backend uçlarını ekle

**Files:**

- Modify: `backend/app/routers/saved.py:17-340`
- Modify: `backend/tests/test_saved_places.py`

**Interfaces:**

- Consumes: Task 1 ORM ve Pydantic modelleri.
- Produces: `POST`/`GET /api/saved/{saved_id}/contacts`.
- Produces: gönüllü adıyla çalışan `POST /api/lists` ve `POST /api/saved`.
- Consumed by: Task 3 proxy ve istemci API’si.

- [ ] **Step 1: Kırmızı endpoint testlerini yaz**

```python
def test_contact_event_updates_snapshot(client):
    saved = client.post("/api/saved", headers={"X-VOLUNTEER-NAME": "Ece"}, json=_place()).json()
    response = client.post(
        f"/api/saved/{saved['id']}/contacts",
        headers={"X-VOLUNTEER-NAME": "Ece"},
        json={"status": "follow_up", "contacted_at": "2026-08-23", "note": "Müdürle konuşuldu", "next_follow_up_at": "2026-08-29"},
    )
    assert response.status_code == 201
    assert response.json()["contact_status"] == "follow_up"
    assert response.json()["next_follow_up_at"] == "2026-08-29"
```

Ek testler: boş ve 121 karakterlik başlık 422; bilinmeyen durum/geçersiz
tarih 422; geçmiş `contacted_at DESC, created_at DESC`; başka `api_key.id`
ile yer veya geçmiş 404; yer silinince olaylar yok; liste silinince olaylar
kalır. Var olan `created_by` ve `saved_by` testlerini API anahtarı adı yerine
başlıktaki `Ece` için güncelleyin.

- [ ] **Step 2: Testlerin kırmızı olduğunu doğrula**

Run: `cd backend; pytest tests/test_saved_places.py -q`

Expected: temas yolları 404, yeni doğrulama testleri FAIL.

- [ ] **Step 3: Başlık doğrulamasını ve endpointleri uygula**

```python
def _volunteer_name(x_volunteer_name: str | None = Header(None)) -> str:
    name = (x_volunteer_name or "").strip()
    if not name or len(name) > 120:
        raise HTTPException(status_code=422, detail="Gönüllü adı gerekli ve en fazla 120 karakter olmalı.")
    return name

@router.post("/saved/{saved_id}/contacts", response_model=SavedPlaceResponse, status_code=201)
async def create_contact_event(
    saved_id: str,
    data: ContactEventCreate,
    volunteer_name: str = Depends(_volunteer_name),
    db: AsyncSession = Depends(get_db),
    api_key: APIKey = Depends(validate_api_key),
):
    place = await _owned_place(saved_id, api_key, db)
    db.add(ContactEvent(
        id=str(uuid.uuid4()), saved_place_id=place.id, status=data.status.value,
        contacted_at=data.contacted_at, note=(data.note or "").strip() or None,
        next_follow_up_at=data.next_follow_up_at, volunteer_name=volunteer_name,
        created_at=_now(),
    ))
    place.contact_status = data.status.value
    place.last_contact_at = data.contacted_at
    place.next_follow_up_at = data.next_follow_up_at
    await db.commit()
    await db.refresh(place)
    return place
```

Bu bağımlılığı yalnızca liste oluşturma, yer kaydetme ve temas eklemede
kullanın; `created_by`/`saved_by` alanlarına sonucu yazın. Aynı yeri yeniden
kaydetmek kayıt sahibini değiştirmesin. GET geçmişi önce `_owned_place`
çağırsın, sonra olayları en yeni önce döndürsün. Yer silmede olayları
`delete(ContactEvent).where(ContactEvent.saved_place_id == place.id)` ile
aynı committe silin.

- [ ] **Step 4: Backend kalite paketini çalıştır**

Run: `cd backend; ruff format app/routers/saved.py tests/test_saved_places.py; ruff check .; pytest --cov --cov-fail-under=79 -q`

Expected: PASS; kapsama en az %79.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/saved.py backend/tests/test_saved_places.py
git commit -m "feat: kayitli yerlere temas gecmisi ekle"
```

### Task 3: Proxy ve istemci temas sözleşmesini oluştur

**Files:**

- Modify: `src/server/backend.ts:66-88`
- Modify: `src/lib/savedApi.ts:11-160`
- Modify: `src/lib/savedApi.test.ts`

**Interfaces:**

- Consumes: Task 2 yolları ve kayıtlı yer cevabı.
- Produces: `ContactStatus`, `ContactEvent`, `addContactEvent`, `fetchContactEvents`, `getVolunteerName`.
- Consumed by: Tasks 4-5.

- [ ] **Step 1: Kırmızı istemci testlerini yaz**

```ts
it("temas eklerken gönüllü adını iletir", async () => {
  localStorage.setItem("volunteer_name", "Ece");
  const spy = mockFetch(savedPlace);
  await addContactEvent("saved-1", { status: "contacted", contacted_at: "2026-08-23" });
  expect(spy.mock.calls[0][1].headers).toMatchObject({ "X-VOLUNTEER-NAME": "Ece" });
});

it("isim yokken yazma isteğini göndermeden reddeder", async () => {
  const spy = mockFetch(savedPlace);
  await expect(addContactEvent("saved-1", { status: "contacted", contacted_at: "2026-08-23" })).rejects.toThrow("Gönüllü adınızı Ayarlar'dan girin.");
  expect(spy).not.toHaveBeenCalled();
});
```

`SavedPlace` fixtureına üç yeni alanı ekleyin. Liste oluşturma ve yer
kaydetmenin başlığı taşıdığını, geçmiş GET çağrısının doğru yolu kullandığını
ayrıca test edin.

- [ ] **Step 2: Testlerin kırmızı olduğunu doğrula**

Run: `pnpm test -- src/lib/savedApi.test.ts`

Expected: `addContactEvent` dışa aktarılmadığı için FAIL.

- [ ] **Step 3: Proxy başlığını, türleri ve istemci fonksiyonlarını uygula**

```ts
export type ContactStatus = "uncontacted" | "preparing" | "contacted" | "follow_up" | "positive" | "not_suitable";

export function getVolunteerName(): string | null {
  const value = typeof window === "undefined" ? null : localStorage.getItem("volunteer_name");
  return value?.trim() || null;
}

export const addContactEvent = (id: string, body: ContactEventCreate) =>
  request<SavedPlace>(`/api/saved/${encodeURIComponent(id)}/contacts`, { method: "POST", body, requireVolunteer: true });
```

`request`e `requireVolunteer?: boolean` ekleyin; gerekli ad yoksa fetch
öncesi yukarıdaki hata ile reddetsin. Kimlik gerektiren mutasyonlarda başlığı
ekleyin; geçmiş GET okuma olduğu için başlığa ihtiyaç duymaz. `backend.ts`
`authHeaders` içine yalnızca gelen `x-volunteer-name` değerini
`X-VOLUNTEER-NAME` olarak allowlist edin.

- [ ] **Step 4: İstemci kontrollerini çalıştır**

Run: `pnpm type-check; pnpm lint; pnpm test -- src/lib/savedApi.test.ts`

Expected: PASS; yalnızca mevcut özel-font lint uyarısı olabilir.

- [ ] **Step 5: Commit**

```bash
git add src/server/backend.ts src/lib/savedApi.ts src/lib/savedApi.test.ts
git commit -m "feat: istemci temas API sozlesmesini ekle"
```

### Task 4: Gönüllü adını Ayarlar’dan yönet

**Files:**

- Modify: `src/components/SettingsModal.tsx:25-153`
- Create: `src/components/SettingsModal.test.tsx`

**Interfaces:**

- Consumes: Task 3 `volunteer_name` localStorage anahtarı.
- Produces: cihazda gönüllü adı kaydı ve `onSaved` sonrası güncel kimlik.
- Consumed by: Task 5 eksik ad uyarısının çözülmesi.

- [ ] **Step 1: Kırmızı modal testini yaz**

```tsx
it("gönüllü adını API anahtarından bağımsız kaydeder", async () => {
  render(<SettingsModal isOpen onClose={vi.fn()} onSaved={onSaved} account={null} />);
  await userEvent.type(screen.getByLabelText("Gönüllü adı"), "Ece");
  await userEvent.click(screen.getByRole("button", { name: "Kaydet" }));
  expect(localStorage.getItem("volunteer_name")).toBe("Ece");
  expect(onSaved).toHaveBeenCalledOnce();
});
```

Yeniden açıldığında adın doldurulduğunu ve yalnızca boşlukla kaydedildiğinde
anahtarın kaldırıldığını da test edin.

- [ ] **Step 2: Testin kırmızı olduğunu doğrula**

Run: `pnpm test -- src/components/SettingsModal.test.tsx`

Expected: "Gönüllü adı" alanı bulunamadığı için FAIL.

- [ ] **Step 3: Ayarlar alanını uygula**

`volunteerName` state’ini modal açılışında `localStorage`dan başlatın. API
anahtarından önce aşağıdaki alanı ekleyin ve kaydetmede adı kırpıp saklayın;
boşsa anahtarı kaldırın:

```tsx
<label htmlFor="settings-volunteer-name" className="block text-xs font-medium text-ink">
  Gönüllü adı <span className="font-normal text-ink-4">· kayıtlar için gerekli</span>
</label>
<p className="text-2xs leading-relaxed text-ink-4">
  Ekip içi kayıtların kim tarafından eklendiğini gösterir; yalnızca bu tarayıcıda saklanır.
</p>
```

API anahtarı davranışını değiştirmeyin.

- [ ] **Step 4: Bileşen ve frontend testlerini çalıştır**

Run: `pnpm test -- src/components/SettingsModal.test.tsx; pnpm test; pnpm type-check; pnpm lint`

Expected: PASS; yalnızca mevcut özel-font lint uyarısı olabilir.

- [ ] **Step 5: Commit**

```bash
git add src/components/SettingsModal.tsx src/components/SettingsModal.test.tsx
git commit -m "feat: ayarlara gonullu adi ekle"
```

### Task 5: Durum, geçmiş ve takip zamanı arayüzünü ekle

**Files:**

- Create: `src/lib/contactTracking.ts`
- Create: `src/lib/contactTracking.test.ts`
- Modify: `src/components/SavedPlaceRow.tsx:1-184`
- Modify: `src/app/kayitli/page.tsx:1-396`
- Modify: `src/app/page.tsx:90-180`

**Interfaces:**

- Consumes: Task 3 API fonksiyonları, Task 4 gönüllü adı.
- Produces: durum etiketi, satır-içi temas formu, istek üzerine geçmiş ve vadesi gelen liste.

- [ ] **Step 1: Kırmızı takip zamanı testlerini yaz**

```ts
it("gecikmiş, bugün ve yedi gün içindeki takipleri sıralar", () => {
  const due = getDueFollowUps(places, new Date("2026-08-23T12:00:00"));
  expect(due.map((place) => place.id)).toEqual(["late", "today", "this-week"]);
});

it("takip tarihi olmayan veya sekiz gün sonraki kaydı dışarıda bırakır", () => {
  expect(getDueFollowUps(places, new Date("2026-08-23T12:00:00")).map((place) => place.id)).not.toContain("no-date");
});
```

Fixture tarihlerinde `2026-08-22`, `2026-08-23`, `2026-08-30` ve
`2026-08-31` kullanın; `YYYY-MM-DD` ayrıştırmasını yerel saat kaymasına açık
olmayan biçimde yapın.

- [ ] **Step 2: Testlerin kırmızı olduğunu doğrula**

Run: `pnpm test -- src/lib/contactTracking.test.ts`

Expected: modül bulunamadığı için FAIL.

- [ ] **Step 3: Saf yardımcıları ve takip zamanı bölümünü uygula**

```ts
export const CONTACT_STATUS_LABELS: Record<ContactStatus, string> = {
  uncontacted: "Temas edilmedi", preparing: "Hazırlık", contacted: "Temas kuruldu",
  follow_up: "Takip gerekli", positive: "Olumlu", not_suitable: "Uygun değil",
};

function toDayNumber(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function getDueFollowUps(places: SavedPlace[], today: Date): SavedPlace[] {
  const todayNumber = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000);
  return places
    .filter((place) => place.next_follow_up_at && toDayNumber(place.next_follow_up_at) <= todayNumber + 7)
    .sort((left, right) =>
      toDayNumber(left.next_follow_up_at!) - toDayNumber(right.next_follow_up_at!) ||
      (left.name ?? "").localeCompare(right.name ?? "", "tr")
    );
}
```

Fonksiyonu boş tarihi eleyecek, gecikmişi önce sıralayacak şekilde tamamlayın.
`SavedPage`de `useMemo` ile türetin; kayıtların üzerinde yalnızca doluysa
"Takip zamanı" alanını gösterin. Gecikmiş satıra "Gecikmiş" etiketi koyun.

- [ ] **Step 4: Satır-içi temas formunu ve açılır geçmişi uygula**

`SavedPlaceRowProps`a `onAddContact(id, data): Promise<void>` ekleyin.
Satırda durum etiketi ve varsa takip tarihi gösterin. "Temas ekle" butonu
durum select’i, varsayılan bugünün tarihi, not ve isteğe bağlı takip tarihi
içeren küçük formu açsın. Başarıda form kapansın ve geçmiş yeniden yüklensin;
hata form taslağını korusun. "Geçmişi göster" ilk tıkta
`fetchContactEvents(place.id)` çağırıp sonucu component state’inde saklasın.

`SavedPage`de dönen güncel `SavedPlace` ile state’i değiştirin. Eksik
gönüllü adı hatasında Ayarlar’ı açıp "Temas eklemek için önce Ayarlar’dan
gönüllü adınızı girin." mesajını gösterin. Aynı davranışı liste oluşturma ve
ana haritadaki `savePlace` hatasında uygulayın.

- [ ] **Step 5: Frontend kalite ve elle kabul kontrolü**

Run: `pnpm test; pnpm type-check; pnpm lint`

Expected: PASS; yalnızca mevcut özel-font lint uyarısı olabilir.

Ardından `pnpm dev` ile: Ayarlar’dan Ece girin, yer kaydedin, "Takip gerekli"
ve yarının tarihiyle temas ekleyin, yenileyin, geçmişte Ece/notu görün ve yer
silindikten sonra geçmiş yolunun 404 döndüğünü doğrulayın.

- [ ] **Step 6: Commit**

```bash
git add src/lib/contactTracking.ts src/lib/contactTracking.test.ts src/components/SavedPlaceRow.tsx src/app/kayitli/page.tsx src/app/page.tsx
git commit -m "feat: temas takibi arayuzunu ekle"
```

### Task 6: Birleşik regresyon ve CI doğrulaması

**Files:**

- Modify: `backend/app/database.py`, `backend/app/models.py`, `backend/app/routers/saved.py`, `backend/tests/test_saved_places.py` yalnızca başarısız birleşik testleri düzeltmek için.
- Modify: `src/server/backend.ts`, `src/lib/savedApi.ts`, `src/lib/contactTracking.ts`, `src/components/SettingsModal.tsx`, `src/components/SavedPlaceRow.tsx`, `src/app/kayitli/page.tsx`, `src/app/page.tsx` yalnızca başarısız birleşik testleri düzeltmek için.
- Modify: `.github/workflows/ci.yml` yalnızca yerel ve CI komutları farklıysa.

**Interfaces:**

- Consumes: Tasks 1-5’in veri, API ve arayüz sözleşmeleri.
- Produces: CI’de doğrulanmış bütün özellik.

- [ ] **Step 1: Tüm doğrulama komutlarını sırayla çalıştır**

```bash
cd backend
ruff check .
pytest --cov --cov-fail-under=79 -q
cd ..
pnpm type-check
pnpm lint
pnpm test
```

Expected: tümü başarılı, backend kapsaması en az %79; yalnızca bilinen
özel-font lint uyarısı kalabilir.

- [ ] **Step 2: CI komutlarını yerel komutlarla eşleştir**

`.github/workflows/ci.yml` içindeki backend Ruff/kapsama ve frontend
type-check/lint/test çağrılarının yukarıdaki başarılı çağrılarla aynı olduğunu
doğrulayın. Fark varsa yalnızca eşdeğer komutlara düzeltin.

- [ ] **Step 3: Son commit**

```bash
git add backend src .github/workflows/ci.yml
git commit -m "test: temas takibi regresyonlarını doğrula"
```

Bu commit yalnızca Task 1-5 sonrası gerekli düzeltmeleri içermelidir;
alakasız `.claude-flow/` dosyalarını eklemeyin.
