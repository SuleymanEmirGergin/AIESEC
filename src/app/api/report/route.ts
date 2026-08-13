import { NextRequest, NextResponse } from "next/server";
import { apiUrl, proxyToBackend } from "../../../server/backend";

/**
 * /api/report -> backend POST /api/report
 *
 * Istemci camelCase (ReportData) gonderiyor, backend snake_case
 * (ReportRequest) bekliyor ve lat/lon zorunlu. Cevirme burada yapiliyor
 * ki bilesenler backend semasini bilmek zorunda kalmasin.
 */

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (!body?.placeId || !body?.correctedType) {
    return NextResponse.json(
      { message: "placeId ve correctedType zorunlu." },
      { status: 400 }
    );
  }

  if (typeof body.lat !== "number" || typeof body.lon !== "number") {
    return NextResponse.json(
      { message: "Raporun konumu (lat/lon) eksik." },
      { status: 400 }
    );
  }

  return proxyToBackend(req, {
    url: apiUrl("/report"),
    method: "POST",
    label: "report",
    body: {
      place_id: body.placeId,
      name: body.placeName ?? null,
      shown_type: body.currentType,
      correct_type: body.correctedType,
      lat: body.lat,
      lon: body.lon,
      notes: body.notes ?? null,
      client: "web",
      app_version: process.env.NEXT_PUBLIC_APP_VERSION ?? "2.0.0",
    },
  });
}
