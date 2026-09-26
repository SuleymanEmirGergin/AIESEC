import { afterAll, describe, expect, it } from "vitest";

// Gercek Postgres ister (sayac veritabaninda):
// TEST_DATABASE_URL=postgresql://postgres:aiesec@127.0.0.1:55432/aiesec_test pnpm vitest run
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("giris e-postasi siniri", async () => {
  process.env.DATABASE_URL = url;
  const { getPool } = await import("./db");
  const { allowLoginEmail, PER_ADDRESS_15_MIN } = await import("./loginLimit");
  const email = `sinir-${Date.now()}@ornek.org`;

  afterAll(async () => {
    await getPool().query("DELETE FROM login_emails WHERE email = $1", [email]);
    await getPool().end();
  });

  it("ayni adrese 15 dakikada sinirdan fazlasina izin vermez", async () => {
    const results = [];
    for (let i = 0; i <= PER_ADDRESS_15_MIN; i++) results.push(await allowLoginEmail(email.toUpperCase()));
    expect(results).toEqual([...Array(PER_ADDRESS_15_MIN).fill(true), false]);
  }, 30_000);
});
