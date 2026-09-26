import Link from "next/link";

export const metadata = { title: "Gizlilik" };

/**
 * Herkese acik gizlilik sayfasi (oturum istemez). Google, "Google ile giris"
 * uygulamasini yayina almak icin bu adresi sart kosuyor.
 */
export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-paper px-4 py-10 text-ink-2">
      <article className="mx-auto max-w-2xl space-y-5 text-sm leading-relaxed">
        <p className="mono-label">Rota</p>
        <h1 className="font-display text-2xl font-semibold text-ink">Gizlilik</h1>
        <p>
          Rota, gönüllü ekibimizin kurum ve işletme listesi hazırlamak ve görüşmeleri takip etmek için
          kullandığı, yalnızca davetli ekip üyelerine açık bir iç araçtır.
        </p>
        <h2 className="font-display text-base font-semibold text-ink">Hangi bilgileri tutuyoruz</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Giriş için e-posta adresiniz ve (Google ile girerseniz) Google hesabınızdaki adınız.</li>
          <li>Kaydettiğiniz yerler, listeler, notlar ve temas kayıtları; kimin eklediği bilgisiyle birlikte.</li>
        </ul>
        <p>
          Yer verileri OpenStreetMap ve Overture Maps gibi açık kaynaklardan gelir. Google hesabınızdan ad ve
          e-posta dışında hiçbir bilgi alınmaz.
        </p>
        <h2 className="font-display text-base font-semibold text-ink">Paylaşım</h2>
        <p>
          Bilgiler yalnızca ekip içinde görünür; üçüncü kişilerle paylaşılmaz, satılmaz, reklam için
          kullanılmaz. Veriler sunucu sağlayıcılarımızda (Vercel, Neon) saklanır.
        </p>
        <h2 className="font-display text-base font-semibold text-ink">Silme ve iletişim</h2>
        <p>
          Hesabınızın ve kayıtlarınızın silinmesini istemek ya da soru sormak için{" "}
          <a className="text-accent underline" href="mailto:emirgergin21@gmail.com">
            emirgergin21@gmail.com
          </a>{" "}
          adresine yazabilirsiniz.
        </p>
        <p className="pt-4">
          <Link href="/giris" className="text-accent underline">
            Giriş sayfasına dön
          </Link>
        </p>
      </article>
    </main>
  );
}
