import { NextRequest, NextResponse } from "next/server";
import { currentMember, forbidden, unauthorized } from "../../../server/backend";
import { envAdmins, listMembers, normalizeEmail, removeMember, upsertMember, type Role } from "../../../server/team";

/**
 * /api/team: onayli e-posta listesi. Yalnizca yoneticiler.
 * GET liste, POST {email, role} ekle/rol degistir, DELETE ?email= cikar.
 */

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const me = await currentMember();
  if (!me) return { error: unauthorized() };
  if (me.role !== "admin") return { error: forbidden() };
  return { me };
}

const bad = (message: string) => NextResponse.json({ message }, { status: 400 });

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;
  return NextResponse.json(await listMembers());
}

export async function POST(req: NextRequest) {
  const { me, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : null;
  const role: Role = body?.role === "admin" ? "admin" : "member";
  if (!email) return bad("Geçerli bir e-posta adresi girin.");
  if (envAdmins().has(email)) return bad("Bu adres sabit yönetici; ortam ayarından yönetiliyor.");
  if (email === me.email && role !== "admin") return bad("Kendi yönetici yetkinizi kaldıramazsınız.");

  await upsertMember(email, role, me.email);
  return NextResponse.json({ email, role }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const { me, error } = await requireAdmin();
  if (error) return error;

  const email = normalizeEmail(req.nextUrl.searchParams.get("email") ?? "");
  if (!email) return bad("Geçerli bir e-posta adresi girin.");
  if (email === me.email) return bad("Kendinizi listeden çıkaramazsınız.");
  if (envAdmins().has(email)) return bad("Bu adres sabit yönetici; ortam ayarından yönetiliyor.");

  await removeMember(email);
  return NextResponse.json({ removed: email });
}
