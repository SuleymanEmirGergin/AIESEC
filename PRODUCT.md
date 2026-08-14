# Product

## Register

product

## Users

AIESEC'in yerel ekiplerindeki **öğrenci gönüllüleri**. Staj ve değişim
programları için ortak kurum arıyorlar: okullar, fabrikalar, ofisler,
atölyeler. Bir ilçeyi tarayıp "bunlarla konuşalım" listesi çıkarmak
istiyorlar, sonra o listeyi arayıp e-posta atıyorlar.

Bağlam üç şeyi belirliyor:

1. **Teknik değiller.** Geliştirici kelimeleri ("kota", "API anahtarı",
   "override", "endpoint") onlar için anlamsız. Ekranda görünen her terim
   ya işlerinden bir kelime olmalı ya da yerinde açıklanmalı.
2. **Ekip dönüşken.** Her dönem yeni gönüllüler geliyor, devir teslim
   çoğu zaman yapılmıyor. Arayüz kendini öğretmek zorunda; kurum hafızası
   arayüzün içinde olmalı, ayrılan kişinin kafasında değil.
3. **İş takım işi.** Bir kişinin bulduğu okulu ötekinin görmesi gerekiyor.
   Kişisel bir not defteri yetmez.

## Product Purpose

Bir ilçedeki potansiyel ortak kurumları haritada bulmak, iletişim
bilgileriyle birlikte adlandırılmış listelere kaydetmek ve o listeyi
dışarı aktarıp gerçek temasa geçmek.

**Başarı:** gönüllü uygulamayı kapattığında bulduğu şey kaybolmuyor.
Ertesi hafta, başka bir bilgisayardan, hatta başka bir gönüllü tarafından
aynı liste açılabiliyor.

**Başarısızlık (bugünkü hâli):** seçim yalnızca React state'inde yaşıyor.
Sayfa yenilenince gidiyor. Tek çıkış CSV; uygulamanın içinde hiçbir şey
birikmiyor.

## Brand Personality

**Sakin · açık sözlü · güvenilir.**

Ses tonu: kısa cümleler, iş kelimeleri, abartısız. Kullanıcı bir şeyi
yapamıyorsa nedeni söylenir ve ne yapması gerektiği yazılır. Hiçbir
ekranda kutlama, rozet, "harika!" yok — bulunan şey zaten ödül.

## Anti-references

- **"Eğitim uygulaması" sıcaklığı.** Bu projenin önceki tasarım sistemi
  "kids, education, playful" moduyla üretilmişti (Baloo 2 + Comic Neue).
  Kullanıcılar öğrenci ama iş bir veri işi; arayüz çocuk uygulaması gibi
  görünmemeli.
- **Kurumsal SaaS gösterisi.** Sahte metrik, "+%47" büyüme rozeti, hero
  istatistik şablonu, olmayan özellik vaadi. Bu projede bunlardan bir tur
  temizlik yapıldı; geri gelmemeli.
- **Uzman CRM yoğunluğu.** Salesforce/HubSpot tarzı, öğrenilmesi haftalar
  süren sıkışık panolar. Gönüllüler bunu öğrenmeye vakit ayırmayacak.
- Görsel yasakların tamamı DESIGN.md'de.

## Design Principles

1. **Bulunan şey kaybolmaz.** Kullanıcının emek verdiği her seçim kalıcı
   olmalı. Kaybolabilen bir durum varsa o bir hatadır, özellik değil.
2. **Boş ekran öğretir.** Dönüşken ekipte ilk karşılaşma en sık
   karşılaşmadır. Her boş durum ne yapılacağını ve neden yapıldığını
   söyler; "kayıt yok" tek başına yetersizdir.
3. **Ürünün dilini konuş, sistemin dilini değil.** "Günlük kota" değil
   "bugün kaç indirme hakkın kaldı". Teknik terim ancak kaçınılmazsa ve
   yanında karşılığıyla görünür.
4. **Yoğunluk kazanılır.** Varsayılan sade; yoğunluğu kullanıcı ihtiyaç
   duydukça açar. Gönüllü ilk gün yüz sütunlu bir tabloyla karşılaşmaz.
5. **Takım görünür.** Kaydeden kim, ne zaman, hangi notu bırakmış —
   listede yazar. Devir teslim arayüzün işidir.

## Accessibility & Inclusion

- **WCAG 2.1 AA.** Metin/zemin kontrastı 4.5:1, büyük metin ve ikon 3:1.
  Renk token'ları bu eşiğe göre hesaplanmıştır (bkz. DESIGN.md); palet
  değişirse yeniden hesaplanmalı.
- Renk hiçbir zaman **tek** bilgi taşıyıcısı değildir; durum her yerde
  metin ya da ikonla da anlatılır.
- Tüm etkileşimli öğelerde görünür `:focus-visible` halkası; halka
  animasyonsuz belirir.
- `prefers-reduced-motion: reduce` altında tüm geçişler kesilir.
- Arayüz dili Türkçe; tarih, saat ve sayı biçimleri `tr-TR`.
- Dokunma hedefleri mobilde bölünmez; buton metni iki satıra sarmaz.
