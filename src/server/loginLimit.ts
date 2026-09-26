import { ensureSchema, getPool } from "./db";

/** Ayni adrese 15 dakikada en fazla bu kadar giris e-postasi. */
export const PER_ADDRESS_15_MIN = 3;
/** Tum adreslere toplam, saatte. Gmail'in gunluk ~500 sinirini korur. */
export const TOTAL_PER_HOUR = 30;

/**
 * Giris e-postasi gonderilebilir mi? Gonderilecekse kaydeder. Sayac
 * veritabaninda: serverless'ta her ornegin kendi bellegi var, bellekte
 * tutulan sinir ornekler arasinda paylasilmazdi.
 */
export async function allowLoginEmail(rawEmail: string): Promise<boolean> {
  const email = rawEmail.trim().toLowerCase();
  await ensureSchema();
  const pool = getPool();
  await pool.query("DELETE FROM login_emails WHERE sent_at < now() - interval '1 day'");
  const { rows } = await pool.query(
    `SELECT count(*) FILTER (WHERE email = $1 AND sent_at > now() - interval '15 minutes') AS mine,
            count(*) FILTER (WHERE sent_at > now() - interval '1 hour') AS total
       FROM login_emails`,
    [email]
  );
  if (Number(rows[0].mine) >= PER_ADDRESS_15_MIN || Number(rows[0].total) >= TOTAL_PER_HOUR) return false;
  await pool.query("INSERT INTO login_emails (email) VALUES ($1)", [email]);
  return true;
}
