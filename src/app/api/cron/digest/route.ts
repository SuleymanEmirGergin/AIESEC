import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createTransport } from "nodemailer";
import { apiUrl } from "../../../../server/backend";
import { listAssignableMembers, listMembers } from "../../../../server/team";
import { buildDigests, digestEmail } from "../../../../server/digest";
import type { SavedPlace } from "../../../../lib/savedApi";

export const dynamic = "force-dynamic";

/** Sabit sureli karsilastirma: yanit suresinden anahtar tahmin edilemesin. */
function validCronAuth(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Her sabah Vercel Cron cagiriyor (vercel.json). Oturum yok; Vercel
 * `Authorization: Bearer $CRON_SECRET` gonderiyor, digerleri 401.
 * `?dry=1` e-posta gondermeden kime kac kayit gidecegini dondurur.
 */
export async function GET(req: NextRequest) {
  if (!validCronAuth(req.headers.get("authorization"))) {
    return NextResponse.json({ message: "Yetkisiz." }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get("dry") === "1";
  const server = process.env.EMAIL_SERVER;
  // ?verify=1: SMTP'ye yalnizca giris dener, e-posta gondermez.
  if (req.nextUrl.searchParams.get("verify") === "1") {
    if (!server) return NextResponse.json({ smtp: "EMAIL_SERVER tanımlı değil" }, { status: 503 });
    try {
      await createTransport(server).verify();
      return NextResponse.json({ smtp: "ok", from: !!process.env.EMAIL_FROM });
    } catch (error: any) {
      return NextResponse.json({ smtp: "hata", code: error?.code, response: error?.response }, { status: 502 });
    }
  }
  if (!server && !dry) {
    return NextResponse.json({ skipped: "EMAIL_SERVER tanımlı değil; sabah e-postası kapalı." });
  }

  const url = apiUrl("/saved");
  const key = process.env.SEARCH_API_KEY;
  if (!url || !key) {
    return NextResponse.json({ message: "Backend adresi ya da anahtarı eksik." }, { status: 503 });
  }
  const response = await fetch(url, { headers: { "X-API-KEY": key, "X-VOLUNTEER-NAME": "Rota" }, cache: "no-store" });
  if (!response.ok) {
    console.error(`[digest] kayitlar alinamadi: HTTP ${response.status}`);
    return NextResponse.json({ message: "Kayıtlar alınamadı." }, { status: 502 });
  }
  const places: SavedPlace[] = await response.json();

  const [members, named] = await Promise.all([listMembers(), listAssignableMembers()]);
  const names = new Map(named.map((m) => [m.email, m.name]));
  const recipients = members.map((m) => ({ email: m.email, role: m.role, name: names.get(m.email) ?? m.email.split("@")[0] }));

  const today = new Date();
  const digests = buildDigests(places, recipients, today);
  if (dry) {
    return NextResponse.json({ dry: true, recipients: digests.map((d) => ({ to: d.to, mine: d.mine.length, unassigned: d.unassigned.length })) });
  }

  const baseUrl = process.env.AUTH_URL ?? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const from = process.env.EMAIL_FROM ?? "Rota <no-reply@localhost>";
  const transport = createTransport(server);
  let sent = 0;
  const failed: string[] = [];
  for (const d of digests) {
    try {
      await transport.sendMail({ to: d.to, from, ...digestEmail(d, baseUrl, today) });
      sent += 1;
    } catch (error: any) {
      // Bir alicinin hatasi digerlerini durdurmasin.
      console.error(`[digest] ${d.to} gonderilemedi:`, error?.message);
      failed.push(d.to);
    }
  }
  return NextResponse.json({ sent, failed });
}
