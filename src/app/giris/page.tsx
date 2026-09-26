import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { AlertCircle, Mail, MailCheck } from "lucide-react";
import { auth, emailEnabled, googleEnabled, signIn } from "../../auth";

export const dynamic = "force-dynamic";

/** Auth.js hata kodlari -> kullaniciya soylenecek. */
const ERRORS: Record<string, string> = {
  AccessDenied: "Bu e-posta ekipte kayıtlı değil. Yöneticinizden sizi eklemesini isteyin.",
  Verification: "Giriş bağlantısının süresi dolmuş ya da daha önce kullanılmış. Yeni bağlantı isteyin.",
  oturum: "Oturumunuz sona erdi ya da erişiminiz kaldırıldı. Tekrar giriş yapın.",
};
const FALLBACK_ERROR = "Giriş yapılamadı. Lütfen tekrar deneyin.";

/**
 * Donus adresinin yalnizca yolu alinir: middleware tam URL veriyor, ama
 * baska bir siteye yonlendirme (acik yonlendirme) mumkun olmamali.
 */
function safeCallback(value: string | undefined): string {
  if (!value) return "/";
  try {
    const url = new URL(value, "http://yerel");
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return "/";
  }
}

async function start(provider: "google" | "email", redirectTo: string, email?: string) {
  "use server";
  try {
    await signIn(provider, { redirectTo, ...(email ? { email } : {}) });
  } catch (error) {
    // signIn basarida NEXT_REDIRECT firlatiyor; o aynen gecmeli.
    if (error instanceof AuthError) {
      redirect(`/giris?error=${error.type === "AccessDenied" ? "AccessDenied" : "Default"}`);
    }
    throw error;
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallback(params.callbackUrl);
  if ((await auth())?.user) redirect(callbackUrl);

  const errorKey = params.error ?? params.hata;
  const error = errorKey ? ERRORS[errorKey] ?? FALLBACK_ERROR : null;
  const sent = params.gonderildi === "1";

  async function withGoogle() {
    "use server";
    await start("google", callbackUrl);
  }

  async function withEmail(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "").trim();
    if (email) await start("email", callbackUrl, email);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 text-ink-2">
      <div className="w-full max-w-sm">
        <p className="mono-label">AIESEC</p>
        <h1 className="font-display text-2xl font-semibold text-ink">POI Finder</h1>
        <p className="mt-1 text-sm text-ink-3">Ekip girişi. Yalnızca onaylı e-postalar girebilir.</p>

        {error && (
          <p role="alert" className="mt-5 flex items-start gap-2 rounded-input bg-caution-bg px-3 py-2.5 text-xs text-caution">
            <AlertCircle size={14} className="mt-px shrink-0" aria-hidden="true" />
            {error}
          </p>
        )}

        {sent ? (
          <div className="mt-6 rounded-card border border-rule p-5 text-center">
            <MailCheck size={24} aria-hidden="true" className="mx-auto mb-3 text-accent" />
            <p className="text-sm font-medium text-ink">E-postanızı kontrol edin</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">
              Giriş bağlantısını gönderdik; 1 saat geçerli. Gelmediyse gereksiz (spam) klasörüne bakın.
            </p>
            <a href="/giris" className="btn btn--ghost mt-4 inline-flex px-3 py-1.5 text-xs">
              Başka yolla giriş yap
            </a>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {googleEnabled && (
              <form action={withGoogle}>
                <button type="submit" className="btn btn--primary w-full justify-center px-4 py-2.5">
                  <span aria-hidden="true" className="font-semibold">G</span>
                  Google ile giriş yap
                </button>
              </form>
            )}

            {googleEnabled && emailEnabled && (
              <div className="flex items-center gap-3 text-2xs text-ink-4">
                <span className="h-px flex-1 bg-rule" />
                veya
                <span className="h-px flex-1 bg-rule" />
              </div>
            )}

            {emailEnabled && (
              <form action={withEmail} className="space-y-2">
                <label htmlFor="login-email" className="block text-xs font-medium text-ink">
                  E-posta ile giriş bağlantısı
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="ornek@aiesec.net"
                  className="w-full rounded-input border border-rule-2 bg-paper px-3 py-2.5 text-sm text-ink placeholder:text-ink-4 hover:border-ink-4 focus:border-accent"
                />
                <button
                  type="submit"
                  className={`btn w-full justify-center px-4 py-2.5 ${googleEnabled ? "btn--ghost" : "btn--primary"}`}
                >
                  <Mail size={14} aria-hidden="true" />
                  Bağlantı gönder
                </button>
              </form>
            )}

            {!googleEnabled && !emailEnabled && (
              <p className="text-xs text-critical">
                Giriş yöntemi yapılandırılmamış (AUTH_GOOGLE_ID / EMAIL_SERVER).
              </p>
            )}
          </div>
        )}

        <p className="mt-8 text-center text-2xs text-ink-4">
          <a href="/gizlilik" className="underline hover:text-ink">
            Gizlilik
          </a>
        </p>
      </div>
    </main>
  );
}
