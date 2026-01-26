import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../../../server/rateLimit";
import { fetchOverpass } from "../../../server/overpass";
import { normalizeOverpassElement } from "../../../lib/normalize";
import CacheService from "../../../server/cache";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    // 1. IP ve Rate Limit
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const rl = await rateLimit(ip);
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
    }

    // 2. Body ve Validasyon
    const body = await req.json();
    const { bbox, category, limit = 100 } = body;

    if (!bbox || !Array.isArray(bbox) || bbox.length !== 4) {
      return NextResponse.json({ error: "Invalid bbox" }, { status: 400 });
    }
    if (!category) {
      return NextResponse.json({ error: "Category required" }, { status: 400 });
    }

    // 3. Cache Kontrol
    const bodyHash = crypto.createHash("md5").update(JSON.stringify(body)).digest("hex");
    const cacheKey = `search:${bodyHash}`;
    const cachedData = await CacheService.get(cacheKey);
    
    if (cachedData) {
      return NextResponse.json(cachedData, { headers: { "X-Cache": "HIT" } });
    }

    // 4. Overpass Fetch (Retry)
    let data;
    let attempts = 0;
    while (attempts < 3) {
      try {
        data = await fetchOverpass(bbox as [number, number, number, number], category, limit);
        break;
      } catch (err) {
        attempts++;
        if (attempts === 3) throw err;
        await new Promise(r => setTimeout(r, attempts * 500));
      }
    }

    // 5. Normalizasyon
    const places = (data.elements || []).map((el: any) => 
      normalizeOverpassElement(el, category)
    );

    const responseData = {
      success: true,
      data: places,
      total: places.length,
      meta: { cached: false, provider: "overpass" }
    };

    // 6. Cache'e Yaz
    await CacheService.set(cacheKey, responseData, 600);

    return NextResponse.json(responseData, { headers: { "X-Cache": "MISS" } });

  } catch (error: any) {
    console.error("API Error:", error.message);
    return NextResponse.json({
      success: false,
      error: error.message || "Internal Server Error",
      places: []
    }, { status: 502 });
  }
}
