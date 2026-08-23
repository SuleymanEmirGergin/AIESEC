# Temas Takibi ve Gönüllü Adı Teknik Tasarımı

**Tarih:** 2026-08-23  
**Durum:** Tasarım onaylandı; uygulama planı bekliyor

## Amaç

Ekipçe kullanılan kayıtlı yerleri, yalnızca "kaydedildi" durumunda bırakmak
yerine takip edilebilir ilişkilere dönüştürmek. Her cihazdaki gönüllü kendi
adını ayarlayacak; liste oluşturma, yer kaydetme ve temas ekleme işlemleri bu
adla izlenecek. Hesap sistemi eklenmeyecek: ekip sahipliği mevcut API anahtarı
temelinde kalacak.

## Kapsam ve kapsam dışı

Kapsam:

- Yerel olarak saklanan gönüllü adı ve mutasyon isteklerinde
  `X-VOLUNTEER-NAME` başlığı
- Kaydedilmiş yer için güncel temas durumu, son temas ve sonraki takip tarihi
- Her temasın değiştirilemez geçmiş olayı olarak tutulması
- `/kayitli` sayfasında vadesi bugün veya bu hafta olanların belirgin bölümü
- Geçmişin istek üzerine yüklenmesi

Kapsam dışı:

- Kullanıcı hesabı, oturum açma veya kişi bazlı yetkilendirme
- E-posta, push bildirimi ya da otomatik hatırlatma
- Geçmiş olayını düzenleme/silme
- Liste silindiğinde yer veya temas geçmişini silme

## Kullanıcı deneyimi

Gönüllü adı Ayarlar penceresine eklenir ve yalnızca tarayıcının
`localStorage` alanında tutulur. İsim yoksa kullanıcı arama ve mevcut kayıtları
görüntülemeye devam eder; ancak yeni liste oluşturamaz, yer kaydedemez veya
temas olayı ekleyemez. Bu mutasyonlar kullanıcıyı Ayarlar'a yönlendiren açık
bir mesajla engellenir.

Yeni kaydedilen yer `Temas edilmedi` durumunda başlar. Kaydedilmiş yer satırı
güncel durum etiketini ve varsa sonraki takip tarihini gösterir. Satırdaki
"Temas ekle" eylemi aşağıdaki küçük formu açar:

- durum (zorunlu)
- temas tarihi (zorunlu, varsayılan bugün)
- kısa not (isteğe bağlı)
- sonraki takip tarihi (isteğe bağlı)

Her gönderim yeni bir geçmiş olayı oluşturur; eski olayların yerine yazılmaz.
Kullanıcı geçmişi istediğinde olaylar en yeni önce yüklenir. `/kayitli`
sayfasının üstünde, takip tarihi bugün olanlar ve gelecek yedi gün içindekiler
ayrı, görünür bir "Takip zamanı" alanında gösterilir. Takip tarihi geçmiş
olanlar da bu alana dahil edilir ve gecikmiş olarak işaretlenir.

## Durum sözleşmesi

Backend ve frontend aynı sabit kodları kullanır; arayüz sadece Türkçe etiketi
gösterir.

| Kod | Arayüz etiketi |
| --- | --- |
| `uncontacted` | Temas edilmedi |
| `preparing` | Hazırlık |
| `contacted` | Temas kuruldu |
| `follow_up` | Takip gerekli |
| `positive` | Olumlu |
| `not_suitable` | Uygun değil |

## Veri modeli ve migration

`saved_places` ek alanları, yerin güncel özetini hızlı listeleme için tutar:

- `contact_status`: boş olamaz; varsayılan `uncontacted`
- `last_contact_at`: isteğe bağlı tarih
- `next_follow_up_at`: isteğe bağlı tarih

Yeni `contact_events` tablosu geçmişin kaynak kaydıdır:

- `id`: UUID birincil anahtar
- `saved_place_id`: `saved_places.id` dış anahtarı; yer silinince olayları da
  silinir
- `status`: geçerli durum kodu
- `contacted_at`: temas tarihi
- `note`: isteğe bağlı, en fazla 1000 karakter
- `next_follow_up_at`: isteğe bağlı tarih
- `volunteer_name`: en fazla 120 karakter, boş olamaz
- `created_at`: UTC zaman damgası

`saved_place_id, contacted_at, created_at` üzerinde indeks, geçmişin sıralı
yüklenmesini destekler. Mevcut SQLite kurulumları için `init_db`, önce
`create_all` çalıştırır; ardından `PRAGMA table_info(saved_places)` ile eksik
üç sütunu idempotent biçimde `ALTER TABLE` ile ekler. Var olan kayıtlar
otomatik olarak `uncontacted`, boş son temas ve boş takip tarihiyle görünür;
geçmiş olayları yoktur. Yeni tablo `create_all` tarafından yaratılır.

Yer silme akışı temas olaylarını da açıkça siler; böylece SQLite bağlantısında
foreign-key pragma ayarı ne olursa olsun veri artığı kalmaz. Liste silme,
mevcut davranışını korur: yerleri yalnızca dosyalanmamış yapar; durumları ve
temas geçmişleri korunur.

## API ve yetkilendirme

Ekip alanı mevcut `X-API-KEY` doğrulamasıyla belirlenmeye devam eder. Gönüllü
adı yetkilendirme aracı değildir; yalnızca kayıt oluşturucusu/audit bilgisidir.
Next.js proxy katmanı, izinli iletilen başlıklara `X-VOLUNTEER-NAME` ekler.
Backend bu başlığı kırpar; boşsa veya 120 karakteri aşarsa yazma isteğini 422
ile reddeder.

Gönüllü adı gerektiren mevcut yazma uçları:

- `POST /api/lists`: `created_by` gönüllü adı olur
- `POST /api/saved`: `saved_by` gönüllü adı olur
- `POST /api/saved/{saved_id}/contacts`: olayın `volunteer_name` alanı olur

Yeni uçlar:

- `POST /api/saved/{saved_id}/contacts`: olayı ekler, aynı transaction içinde
  yerin `contact_status`, `last_contact_at` ve `next_follow_up_at` özetini
  günceller; güncel kaydı döndürür.
- `GET /api/saved/{saved_id}/contacts`: yalnızca aynı API anahtarına ait
  yerin olaylarını en yeni önce döndürür.

`GET /api/saved` ve yer kaydetme/güncelleme cevapları şu alanları ekler:
`contact_status`, `last_contact_at`, `next_follow_up_at`. Başka bir ekibe ait
yer veya geçmiş isteği, varlığını sızdırmadan 404 döndürür.

## İstemci bileşenleri

`savedApi` ortak istek katmanı gönüllü adını `localStorage`dan alır ve tüm
yazma isteklerine başlık olarak ekler. Aynı katman, isimsiz yazma isteğini
sunucuya göndermeden anlamlı bir istemci hatasıyla keser. Okuma istekleri
isme ihtiyaç duymaz.

`SettingsModal`, API anahtarı alanının yanına zorunlu ad alanını ekler.
Arama sayfası ve `/kayitli` sayfası mevcut Ayarlar açma akışını kullanarak
eksik ad uyarısını gösterir. `SavedPlaceRow` durum/follow-up özetini, temas
formunu ve açılır geçmişi sahiplenir; `/kayitli` sayfası ise liste verisinden
vadesi gelen kayıtları türetip üst bölümü oluşturur.

## Hata davranışı

- Bilinmeyen durum, geçersiz tarih veya 120 karakteri aşan/boş gönüllü adı:
  422
- Eksik gönüllü adı: istemcide engellenir; başlık doğrudan backend'e ulaşırsa
  backend de 422 döndürür
- Yetkisiz ekip kaydı: 404
- Ağ hatası: mevcut istek katmanının kullanıcıya gösterdiği hata mesajı;
  form girdisi kaybolmaz
- Temas ekleme başarısız olursa güncel durum özeti ve olay geçmişi değişmez

## Test stratejisi

Backend testleri şunları kapsar:

- idempotent migration ve eski kayıtların güvenli varsayılanları
- gönüllü adı zorunluluğu, uzunluk kontrolü ve isimle liste/yer kaydı
- durum/doğrulanmış tarih kuralları
- temas olayının eklenmesiyle güncel özetin atomik güncellenmesi
- geçmişin sıralaması ve ekipler arası 404 izolasyonu
- yer silinince olayların silinmesi; liste silinince yer ve olayların kalması

Frontend testleri şunları kapsar:

- gönüllü adının yazma isteklerine başlık olarak eklenmesi
- isim yokken yazma isteğinin gönderilmemesi
- temas formu alanlarının API gövdesine doğru dönüşmesi
- vadesi bugün/gecikmiş/bu hafta olanların doğru "Takip zamanı" bölümüne
  alınması

Mevcut CI sözleşmesine uyulur: backend Ruff ve yüzde 79 kapsama eşiğiyle,
frontend ise type-check, lint ve Vitest testleriyle doğrulanır.
