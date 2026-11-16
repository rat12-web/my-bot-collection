import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ uuid: string }> }
) {
  const { uuid } = await context.params;
  if (!uuid || !/^[A-Za-z0-9_-]{4,40}$/.test(uuid)) {
    return NextResponse.json(
      { success: false, error: "Invalid deck UUID" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(`https://bottcg.com/api/decks/${encodeURIComponent(uuid)}`, {
      headers: { "User-Agent": "MyBOTCollection/1.0" },
      cache: "no-store",
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
        error: err instanceof Error ? err.message : "Failed to fetch deck detail",
      },
      { status: 502 }
    );
  }
}
