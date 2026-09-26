import { NextRequest } from "next/server";
import { apiUrl, proxyToBackend } from "../../../server/backend";

/** /api/dashboard -> backend GET /api/dashboard (ekip panosu). */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return proxyToBackend(req, { url: apiUrl("/dashboard"), method: "GET", label: "dashboard" });
}
