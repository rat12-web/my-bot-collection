import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const params = new URLSearchParams({
    sort: sp.get("sort") || "newest",
    limit: sp.get("limit") || "12",
    offset: sp.get("offset") || "0",
    includeCards: sp.get("includeCards") || "false",
  });

  const deckname = sp.get("deckname");
  if (deckname) params.set("deckname", deckname);
  const colors = sp.get("colors");
  if (colors) params.set("colors", colors);
  const symbols = sp.get("symbols");
  if (symbols) params.set("symbols", symbols);

  try {
    const res = await fetch(`https://bottcg.com/api/decks/public?${params.toString()}`, {
      headers: { "User-Agent": "MyBOTCollection/1.0" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `bottcg.com returned HTTP ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to reach bottcg.com",
      },
      { status: 502 }
    );
  }
}
