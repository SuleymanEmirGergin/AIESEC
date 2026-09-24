import { NextRequest, NextResponse } from "next/server";
import { apiUrl, proxyToBackend, resolveApiKey } from "../../../server/backend";

/**
 * /api/exports -> backend GET /api/exports
 *
 * Gecmiste alinan CSV'ler. ExportLog tablosu bastan beri yaziliyordu ama
 * hicbir uc onu okumuyordu; veri birikiyor, kimse goremiyordu.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { key } = resolveApiKey(req);
  if (!key) {
    return NextResponse.json(
      { message: "Sunucu anahtari yapilandirilmamis (SEARCH_API_KEY)." },
      { status: 503 }
    );
  }

  return proxyToBackend(req, {
    url: apiUrl(`/exports${req.nextUrl.search}`),
    method: "GET",
    label: "exports",
    apiKey: key,
  });
}
