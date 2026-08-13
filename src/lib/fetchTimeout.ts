/**
 * Istemci tarafi timeout yardimcilari.
 *
 * Neden gerekli: backend Overpass'e 5 denemeye kadar retry yapiyor ve her
 * deneme 60 sn'ye kadar surebiliyor. Tarayicida hicbir sinir olmadigi icin
 * bir arama dakikalarca askida kalabiliyor, kullanici yalnizca donen
 * spinner goruyordu.
 *
 * Onemli ayrinti: timeout'u AbortController ile uygularsak fetch
 * AbortError firlatir; oysa cagiran taraf AbortError'i "kullanici yeni
 * arama baslatti" diye yorumlayip sessizce yutuyor. Bu yuzden timeout
 * ayirt edilebilir bir hata olarak yukari veriliyor.
 */

/** Timeout'u kullanici iptalinden ayirmak icin kullanilan hata tipi. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Istek ${Math.round(ms / 1000)} saniyede tamamlanmadi.`);
    this.name = "TimeoutError";
  }
}

interface CombinedSignal {
  signal: AbortSignal;
  /** Abort'un sebebi timeout muydu, yoksa cagiranin iptali mi? */
  timedOut: () => boolean;
  /** Zamanlayiciyi ve dinleyiciyi birak. finally icinde cagirilmali. */
  cleanup: () => void;
}

/**
 * Cagiranin signal'i ile bir zaman sinirini tek bir signal'de birlestirir.
 * AbortSignal.any() kullanilmiyor: nispeten yeni bir API ve hangi sebeple
 * abort edildigini ayirt etmemizi kolaylastirmiyor.
 */
export function withTimeout(
  timeoutMs: number,
  externalSignal?: AbortSignal
): CombinedSignal {
  const controller = new AbortController();
  let didTimeout = false;

  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  const onExternalAbort = () => controller.abort();

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  return {
    signal: controller.signal,
    timedOut: () => didTimeout,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}
