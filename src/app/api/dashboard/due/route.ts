import { NextRequest } from "next/server";
import { apiUrl, proxyToBackend } from "../../../../server/backend";

/** /api/dashboard/due -> backend (menudeki "Bugun" rozeti). */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return proxyToBackend(req, { url: apiUrl(`/dashboard/due${req.nextUrl.search}`), method: "GET", label: "dashboard/due" });
}
