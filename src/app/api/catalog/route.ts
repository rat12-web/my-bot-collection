import { NextRequest, NextResponse } from "next/server";
import catalogSnapshot from "@/data/cards-catalog.json";
import type { RawBotCard } from "@/lib/types";

const DEFAULT_CARDS_JSON = "https://cdn.bottcg.com/data/cards.feab7649.json";

async function discoverLatestCardsJsonUrl(): Promise<string> {
  try {
    const pageRes = await fetch("https://bottcg.com/cards", {
      headers: { "User-Agent": "MyBOTCollection/1.0" },
      next: { revalidate: 3600 },
    });
    if (!pageRes.ok) return DEFAULT_CARDS_JSON;
    const html = await pageRes.text();
    const chunks = [...html.matchAll(/\/_next\/static\/immutable\/chunks\/[^"']+\.js/g)].map(
      (m) => m[0]
    );
    for (const chunk of chunks) {
      const cRes = await fetch(`https://bottcg.com${chunk}`);
      if (!cRes.ok) continue;
      const text = await cRes.text();
      const match = text.match(/https:\/\/cdn\.bottcg\.com\/data\/cards\.[a-f0-9]+\.json/);
      if (match) return match[0];
    }
  } catch {
    // Fallback
  }
  return DEFAULT_CARDS_JSON;
}

export async function GET(req: NextRequest) {
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";

  if (!refresh) {
    const snap = catalogSnapshot as {
      sourceUrl: string;
      syncedAt: string;
      cards: RawBotCard[];
    };
    return NextResponse.json({
      success: true,
      sourceUrl: snap.sourceUrl,
      syncedAt: snap.syncedAt,
      count: snap.cards.length,
      cards: snap.cards,
    });
  }

  try {
    const liveUrl = await discoverLatestCardsJsonUrl();
    const res = await fetch(liveUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cards = (await res.json()) as RawBotCard[];
    return NextResponse.json({
      success: true,
      sourceUrl: liveUrl,
      syncedAt: new Date().toISOString(),
      count: cards.length,
      cards,
    });
  } catch (err) {
    const snap = catalogSnapshot as {
      sourceUrl: string;
      syncedAt: string;
      cards: RawBotCard[];
    };
    return NextResponse.json({
      success: true,
      fallback: true,
      warning: err instanceof Error ? err.message : "Live fetch failed, serving local snapshot",
      sourceUrl: snap.sourceUrl,
      syncedAt: snap.syncedAt,
      count: snap.cards.length,
      cards: snap.cards,
    });
  }
}
