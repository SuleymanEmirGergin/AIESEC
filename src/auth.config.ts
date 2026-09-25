import type { NextAuthConfig } from "next-auth";
import { NextResponse } from "next/server";

/**
 * Middleware'in de kullandigi, veritabanina dokunmayan yapilandirma.
 * Saglayicilar ve onayli-liste kontrolu auth.ts'te (Node calisma zamani).
 */

/** Yalnizca yoneticilerin acabildigi sayfalar. */
const ADMIN_PAGES = ["/ekip", "/admin"];

export const authConfig = {
  pages: {
    signIn: "/giris",
    verifyRequest: "/giris?gonderildi=1",
    error: "/giris",
  },
  // JWT: her istekte veritabanina gitmeden oturum okunuyor.
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const signedIn = !!auth?.user;
      const isApi = pathname.startsWith("/api/");

      if (!signedIn) {
        return isApi
          ? NextResponse.json({ message: "Oturum açmanız gerekiyor." }, { status: 401 })
          : false; // -> /giris
      }
      if (ADMIN_PAGES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
        return auth.user.role === "admin" ? true : NextResponse.redirect(new URL("/", request.nextUrl));
      }
      return true;
    },
    // Rol token'a giris aninda auth.ts'teki jwt callback'inde yaziliyor.
    session({ session, token }) {
      session.user.role = token.role === "admin" ? "admin" : "member";
      return session;
    },
  },
} satisfies NextAuthConfig;
