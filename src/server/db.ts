import { Pool } from "pg";

/**
 * Next.js sunucusunun Postgres baglantisi: yalnizca kimlik tablolari
 * (Auth.js) ve onayli e-posta listesi. Uygulama verisi (yerler, kayitlar)
 * FastAPI'de; ayni veritabani, ayri tablolar.
 *
 * Serverless'ta her ornek kendi havuzunu aciyor; havuz kucuk tutuluyor ki
 * Neon'un baglanti sinirina birkac es zamanli ornek dayanmasin.
 */

declare global {
  // Gelistirmede HMR her kaydetmede modulu yeniden yukluyor; havuz tek kalsin.
  var __authPool: Pool | undefined;
}

const MAX_CONNECTIONS = 3;

export function getPool(): Pool {
  if (!globalThis.__authPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL tanımlı değil.");
    globalThis.__authPool = new Pool({ connectionString, max: MAX_CONNECTIONS });
  }
  return globalThis.__authPool;
}

/**
 * Auth.js pg-adapter'in bekledigi tablolar (paketin kendi semasi) ve
 * onayli e-posta listesi. IF NOT EXISTS: her soguk baslangicta bir kez
 * calisiyor, ayri bir migration adimi gerektirmiyor.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL,
  PRIMARY KEY (identifier, token)
);
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  email VARCHAR(255),
  "emailVerified" TIMESTAMPTZ,
  image TEXT
);
CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  type VARCHAR(255) NOT NULL,
  provider VARCHAR(255) NOT NULL,
  "providerAccountId" VARCHAR(255) NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" VARCHAR(255) NOT NULL
);
CREATE TABLE IF NOT EXISTS allowed_emails (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  added_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS login_emails (
  email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_emails_sent_at ON login_emails (sent_at);
`;

let schemaReady: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((error) => {
        // Basarisiz denemeyi onbellekte birakmak kalici hataya donerdi.
        schemaReady = null;
        throw error;
      });
  }
  return schemaReady;
}
