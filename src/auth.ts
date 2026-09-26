import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import PostgresAdapter from "@auth/pg-adapter";
import { createTransport } from "nodemailer";
import { authConfig } from "./auth.config";
import { ensureSchema, getPool } from "./server/db";
import { getMember } from "./server/team";
import { loginEmail } from "./server/loginEmail";
import { allowLoginEmail } from "./server/loginLimit";

/** Giris baglantisinin gecerlilik suresi. */
const EMAIL_LINK_MAX_AGE_S = 60 * 60;

/**
 * E-posta ile giris yalnizca SMTP tanimliysa acik. Gelistirmede SMTP
 * yoksa baglanti sunucu konsoluna yaziliyor; uretimde SMTP'siz saglayici
 * hic eklenmiyor (sessizce e-posta gondermeyen bir buton olmasin).
 */
function emailProvider() {
  const server = process.env.EMAIL_SERVER;
  const devFallback = !server && process.env.NODE_ENV !== "production";
  if (!server && !devFallback) return null;

  return Nodemailer({
    id: "email",
    name: "E-posta",
    server: server ?? "smtp://localhost",
    from: process.env.EMAIL_FROM ?? "Rota <no-reply@localhost>",
    maxAge: EMAIL_LINK_MAX_AGE_S,
    async sendVerificationRequest({ identifier, url, provider }) {
      if (!server) {
        console.info(`[giris] ${identifier} icin baglanti: ${url}`);
        return;
      }
      // Sinirsiz tetiklenirse Gmail'in gunluk kotasi dolar (sabah ozeti de
      // gidemez) ve kisinin kutusu dolar. Sinir asilinca sessizce gonderilmez;
      // ekranda yine "gonderildi" yazar, saldirgan bir sey ogrenmez.
      if (!(await allowLoginEmail(identifier))) {
        console.warn("[giris] e-posta siniri asildi; baglanti gonderilmedi");
        return;
      }
      const { subject, text, html } = loginEmail(url);
      await createTransport(provider.server).sendMail({ to: identifier, from: provider.from, subject, text, html });
    },
  });
}

export const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);
const email = emailProvider();
export const emailEnabled = email !== null;

export const { handlers, auth, signIn, signOut } = NextAuth(async () => {
  await ensureSchema();
  return {
    ...authConfig,
    adapter: PostgresAdapter(getPool()),
    providers: [
      // Ayni adresle once e-postayla sonra Google'la giren ayni kisi:
      // Google adresi dogruluyor (signIn'de email_verified sart), birlestirmek guvenli.
      ...(googleEnabled ? [Google({ allowDangerousEmailAccountLinking: true })] : []),
      ...(email ? [email] : []),
    ],
    callbacks: {
      ...authConfig.callbacks,
      /**
       * Kapi: yalnizca onayli e-postalar. E-posta akisinda bu, baglanti
       * GONDERILMEDEN once calisiyor; listede olmayana e-posta gitmez.
       */
      async signIn({ user, account, profile }) {
        if (account?.provider === "google" && profile?.email_verified !== true) return false;
        return (await getMember(user.email)) !== null;
      },
      async jwt({ token, user }) {
        if (user) token.role = (await getMember(user.email))?.role ?? "member";
        return token;
      },
    },
  };
});
