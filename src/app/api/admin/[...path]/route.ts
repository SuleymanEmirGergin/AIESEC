import { NextRequest } from "next/server";
import { proxyToBackend, rootUrl } from "../../../../server/backend";

/**
 * /api/admin/* -> backend /admin/*
 *
 * Admin router'i backend'de /api altinda degil kok seviyede yasiyor,
 * bu yuzden rootUrl kullaniliyor. X-ADMIN-KEY basligi proxy katmani
 * tarafindan tasiniyor.
 */

// Calisma aninda backend'e gidiyor; build sirasinda dondurulmamali.
export const dynamic = "force-dynamic";

/** /api/admin/reports/42 -> /admin/reports/42?<query> */
function targetUrl(req: NextRequest, path: string[]): string | null {
  const search = req.nextUrl.search;
  return rootUrl(`/admin/${path.join("/")}${search}`);
}

/** Next 15: dinamik segmentler Promise olarak geliyor. */
type Context = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: Context) {
  const { path } = await params;
  return proxyToBackend(req, {
    url: targetUrl(req, path),
    method: "GET",
    label: `admin/${path.join("/")}`,
  });
}

export async function POST(req: NextRequest, { params }: Context) {
  const { path } = await params;
  return proxyToBackend(req, {
    url: targetUrl(req, path),
    method: "POST",
    body: await req.json().catch(() => ({})),
    label: `admin/${path.join("/")}`,
  });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const { path } = await params;
  return proxyToBackend(req, {
    url: targetUrl(req, path),
    method: "PATCH",
    body: await req.json().catch(() => ({})),
    label: `admin/${path.join("/")}`,
  });
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const { path } = await params;
  return proxyToBackend(req, {
    url: targetUrl(req, path),
    method: "DELETE",
    label: `admin/${path.join("/")}`,
  });
}
