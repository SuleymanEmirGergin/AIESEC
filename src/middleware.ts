import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Her sayfa ve API ucu oturum ister. Kapi yalnizca oturumun VARLIGINA
 * bakiyor (veritabanisiz); onayli-listeden cikarilma kontrolu API
 * proxy'sinde (server/backend.ts).
 */
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: ["/((?!api/auth|giris|_next/static|_next/image|favicon.ico|.*\.(?:png|svg|ico|webp|woff2?)$).*)"],
};
