import { ensureSchema, getPool } from "./db";

/**
 * Onayli e-posta listesi: sisteme yalnizca buradakiler girebiliyor.
 *
 * ADMIN_EMAILS ortam degiskenindekiler her zaman yonetici: ilk yonetici
 * veritabani bosken de girebilsin ve kimse kendini yanlislikla disari
 * kilitleyemesin.
 */

export type Role = "member" | "admin";

export interface Member {
  email: string;
  role: Role;
  /** true: ADMIN_EMAILS'ten geliyor; arayuzden silinemez. */
  fixed: boolean;
  added_by: string | null;
  created_at: string | null;
}

/** Uyelik bu kadar sure onbellekte; listeden cikarilan en gec bu surede duser. */
const CACHE_MS = 60_000;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(email) && email.length <= 254 ? email : null;
}

export function envAdmins(raw = process.env.ADMIN_EMAILS ?? ""): Set<string> {
  return new Set(
    raw
      .split(/[,\s]+/)
      .map((e) => normalizeEmail(e))
      .filter((e): e is string => e !== null)
  );
}

const cache = new Map<string, { member: Member | null; at: number }>();

export function clearMemberCache() {
  cache.clear();
}

/** E-posta onayli mi, rolu ne? Onayli degilse null. */
export async function getMember(rawEmail: string | null | undefined): Promise<Member | null> {
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  if (!email) return null;

  if (envAdmins().has(email)) {
    return { email, role: "admin", fixed: true, added_by: null, created_at: null };
  }

  const hit = cache.get(email);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.member;

  await ensureSchema();
  const { rows } = await getPool().query(
    "SELECT email, role, added_by, created_at FROM allowed_emails WHERE email = $1",
    [email]
  );
  const member: Member | null = rows[0] ? { ...rows[0], fixed: false } : null;
  cache.set(email, { member, at: Date.now() });
  return member;
}

export async function listMembers(): Promise<Member[]> {
  await ensureSchema();
  const { rows } = await getPool().query(
    "SELECT email, role, added_by, created_at FROM allowed_emails ORDER BY created_at DESC"
  );
  const stored: Member[] = rows.map((r) => ({ ...r, fixed: false }));
  const fixed = [...envAdmins()]
    .filter((email) => !stored.some((m) => m.email === email))
    .map((email): Member => ({ email, role: "admin", fixed: true, added_by: null, created_at: null }));
  return [...fixed, ...stored];
}

/** Ekle ya da rolunu guncelle. */
export async function upsertMember(email: string, role: Role, addedBy: string): Promise<void> {
  await ensureSchema();
  await getPool().query(
    `INSERT INTO allowed_emails (email, role, added_by) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role`,
    [email, role, addedBy]
  );
  cache.delete(email);
}

export async function removeMember(email: string): Promise<void> {
  await ensureSchema();
  await getPool().query("DELETE FROM allowed_emails WHERE email = $1", [email]);
  cache.delete(email);
}
