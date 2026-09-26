import { NextRequest } from "next/server";
import { proxyToBackend, rootUrl } from "../../../../server/backend";
import { badPath, pathSuffix } from "../../../../server/paths";

/**
 * /api/admin/* -> backend /admin/*
 *
 * Admin router'i backend'de /api altinda degil kok seviyede yasiyor,
 * bu yuzden rootUrl kullaniliyor. Yalnizca yoneticiler; X-ADMIN-KEY
 * sunucuda ekleniyor (server/backend.ts).
 */

// Calisma aninda backend'e gidiyor; build sirasinda dondurulmamali.
export const dynamic = "force-dynamic";

/** Next 15: dinamik segmentler Promise olarak geliyor. */
type Context = { params: Promise<{ path: string[] }> };

/** /api/admin/reports/42 -> /admin/reports/42?<query> */
async function forward(req: NextRequest, { params }: Context, method: string, withBody: boolean) {
  const suffix = pathSuffix((await params).path);
  if (suffix === null) return badPath();
  return proxyToBackend(req, {
    url: rootUrl(`/admin${suffix}${req.nextUrl.search}`),
    method,
    ...(withBody ? { body: await req.json().catch(() => ({})) } : {}),
    label: `admin${suffix}`,
    admin: true,
  });
}

export const GET = (req: NextRequest, ctx: Context) => forward(req, ctx, "GET", false);
export const POST = (req: NextRequest, ctx: Context) => forward(req, ctx, "POST", true);
export const PATCH = (req: NextRequest, ctx: Context) => forward(req, ctx, "PATCH", true);
export const DELETE = (req: NextRequest, ctx: Context) => forward(req, ctx, "DELETE", false);
