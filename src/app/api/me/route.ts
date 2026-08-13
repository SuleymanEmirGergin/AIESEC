import { NextRequest, NextResponse } from "next/server";
import { apiUrl, proxyToBackend, resolveApiKey } from "../../../server/backend";

/**
 * /api/me -> backend GET /api/me
 *
 * Aramanin ve dosya indirmenin hangi plan/kota ile yapilacagini soyler.
 *
 * Onceden yalnizca istemcinin gonderdigi X-API-KEY'e bakiyordu ve soru
 * "benim anahtarim ne durumda" olarak yorumlanmisti. Ama uygulama zaten
 * anahtarsiz calisiyor: arama sunucunun SEARCH_API_KEY'i uzerinden
 * gidiyor. Sonuc olarak arayuz gercekte Pro bir kimlikle calisirken
 * kullaniciya "hesap yok" diyor, indirme butonunu da bu yuzden kapatiyordu.
 *
 * Artik dogru soru soruluyor: "bu istek hangi kimlikle gidecek". `scope`
 * alani cevabin kaynagini ayirt ediyor - kullanicinin kendi anahtari mi,
 * yoksa herkesin paylastigi sunucu anahtari mi.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { key, scope } = resolveApiKey(req);

  if (!key) {
    return NextResponse.json(
      {
        message:
          "Sunucu anahtari yapilandirilmamis (SEARCH_API_KEY) ve kisisel anahtar da yok.",
      },
      { status: 503 }
    );
  }

  return proxyToBackend(req, {
    url: apiUrl("/me"),
    method: "GET",
    label: "me",
    apiKey: key,
    augment: { scope },
  });
}
