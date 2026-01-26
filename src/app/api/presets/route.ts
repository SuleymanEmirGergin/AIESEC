import { NextResponse } from "next/server";

export async function GET() {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE;
    const apiKey = process.env.SEARCH_API_KEY;

    if (!apiBase) {
      return NextResponse.json({
        max_radius: 5000,
        default_by_type: {
          factory: 5000,
          office: 2000,
          kindergarten: 1000,
          primary_school: 1500,
        },
        radius_options: [500, 1000, 2000, 3000, 5000],
        type_labels_tr: {
          factory: "Fabrika",
          office: "Ofis",
          kindergarten: "Anaokulu",
          primary_school: "İlkokul",
        }
      });
    }

    const baseUrl = apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase;
    const response = await fetch(`${baseUrl}/presets`, {
      headers: {
        "X-API-KEY": apiKey || "",
      },
    });

    if (!response.ok) {
      throw new Error(`Presets API error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Presets route error:", error);
    return NextResponse.json(
      { message: "Failed to fetch presets" },
      { status: 500 }
    );
  }
}
